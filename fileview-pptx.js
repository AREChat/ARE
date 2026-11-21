"use strict";
// ===== pptx（PowerPoint）を、このページの中で見て、スライドショーにする =====
// ・外のライブラリは使わない。pptx は「zip」なので、ブラウザの DecompressionStream で開いて、スライドの XML を読み、HTML で描く。
// ・文字・図形・画像・表・グループ・背景・発表者メモ に対応。グラフ・SmartArt・動画・アニメーションは、枠だけ出す（元のアプリで見てください）。
// ・スライドの文字や名前は、すべて textContent で入れる（HTML として解釈しない）。画像は blob: URL。リンクは作らない。
// ・スライドショー：全画面・矢印キー・スワイプ・タップ・自動で進める。点滅や動きは付けない（目にやさしく）。
(function () {
    var PX = 9525;                                  // 1px = 9525 EMU（96dpi）
    var MAX_ENTRY = 40 * 1024 * 1024, MAX_TOTAL = 220 * 1024 * 1024, MAX_SLIDES = 300;
    var TXT = "http://www.w3.org/2000/svg";

    // ---------- zip を開く ----------
    function u16(d, o) { return d[o] | (d[o + 1] << 8); }
    function u32(d, o) { return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0; }
    function openZip(bytes) {
        var n = bytes.length, i = n - 22, min = Math.max(0, n - 22 - 65535);
        for (; i >= min; i--) if (u32(bytes, i) === 0x06054b50) break;
        if (i < min) throw new Error("zip");
        var count = u16(bytes, i + 10), p = u32(bytes, i + 16), map = Object.create(null);
        for (var k = 0; k < count; k++) {
            if (p + 46 > n || u32(bytes, p) !== 0x02014b50) throw new Error("zip");
            var flags = u16(bytes, p + 8), method = u16(bytes, p + 10), csize = u32(bytes, p + 20), usize = u32(bytes, p + 24);
            var nl = u16(bytes, p + 28), el = u16(bytes, p + 30), cl = u16(bytes, p + 32), lho = u32(bytes, p + 42);
            var name = new TextDecoder("utf-8").decode(bytes.subarray(p + 46, p + 46 + nl));
            map[name] = { method: method, csize: csize, usize: usize, lho: lho, enc: !!(flags & 1) };
            p += 46 + nl + el + cl;
        }
        return { bytes: bytes, map: map, total: 0 };
    }
    function extract(z, name) {
        var e = z.map[name];
        if (!e || e.enc) return Promise.resolve(null);
        if (e.usize > MAX_ENTRY) return Promise.reject(new Error("big"));
        var b = z.bytes;
        if (u32(b, e.lho) !== 0x04034b50) return Promise.reject(new Error("zip"));
        var start = e.lho + 30 + u16(b, e.lho + 26) + u16(b, e.lho + 28);
        var data = b.subarray(start, start + e.csize);
        if (e.method === 0) return Promise.resolve(data);
        if (e.method !== 8) return Promise.reject(new Error("method"));
        if (typeof DecompressionStream !== "function") return Promise.reject(new Error("nostream"));
        var reader = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
        var chunks = [], total = 0;
        function pump() {
            return reader.read().then(function (r) {
                if (r.done) return null;
                total += r.value.length; z.total += r.value.length;
                if (total > MAX_ENTRY || z.total > MAX_TOTAL) { try { reader.cancel(); } catch (_e) { /* 何もしない */ } throw new Error("big"); }
                chunks.push(r.value);
                return pump();
            });
        }
        return pump().then(function () {
            var out = new Uint8Array(total), o = 0;
            chunks.forEach(function (c) { out.set(c, o); o += c.length; });
            return out;
        });
    }
    function readXml(z, name) {
        return extract(z, name).then(function (bytes) {
            if (!bytes) return null;
            var text = new TextDecoder("utf-8").decode(bytes);
            if (/<!DOCTYPE|<!ENTITY/i.test(text)) return null;          // 外から何かを読み込む仕掛け（XXE など）は受けつけない
            var doc = new DOMParser().parseFromString(text, "application/xml");
            if (doc.getElementsByTagName("parsererror").length) return null;
            return doc.documentElement;
        });
    }

    // ---------- XML の小さな道具 ----------
    function kids(el, name) {
        var out = [];
        if (!el) return out;
        for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) out.push(c);
        return out;
    }
    function kid(el, name) {
        if (!el) return null;
        for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (c.localName === name) return c;
        return null;
    }
    function path(el, names) { for (var i = 0; el && i < names.length; i++) el = kid(el, names[i]); return el; }
    function desc(el, name) { return el ? Array.prototype.slice.call(el.getElementsByTagNameNS("*", name)) : []; }
    function num(el, attr, dflt) {
        if (!el) return dflt;
        var v = el.getAttribute(attr);
        if (v === null || v === "") return dflt;
        var x = Number(v);
        return isFinite(x) ? x : dflt;
    }
    function dirOf(p) { var i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i + 1); }
    function resolvePath(base, target) {
        if (!target) return "";
        if (target.charAt(0) === "/") return target.slice(1);
        var parts = (dirOf(base) + target).split("/"), out = [];
        parts.forEach(function (s) { if (s === "..") out.pop(); else if (s && s !== ".") out.push(s); });
        return out.join("/");
    }
    function relsPath(part) { return dirOf(part) + "_rels/" + part.slice(dirOf(part).length) + ".rels"; }
    function loadRels(z, part) {
        return readXml(z, relsPath(part)).then(function (root) {
            var map = {};
            kids(root, "Relationship").forEach(function (r) {
                if (r.getAttribute("TargetMode") === "External") return;
                map[r.getAttribute("Id")] = { type: String(r.getAttribute("Type") || "").split("/").pop(), target: resolvePath(part, r.getAttribute("Target")) };
            });
            return map;
        });
    }

    // ---------- 色 ----------
    var SCHEME_ALIAS = { tx1: "dk1", bg1: "lt1", tx2: "dk2", bg2: "lt2" };
    var PRESET = { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", yellow: "FFFF00", gray: "808080", grey: "808080", orange: "FFA500", purple: "800080", cyan: "00FFFF", magenta: "FF00FF" };
    function hexToRgb(h) { return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
    function rgbToHex(c) { return c.map(function (v) { v = Math.max(0, Math.min(255, Math.round(v))); return (v < 16 ? "0" : "") + v.toString(16); }).join(""); }
    function rgbToHsl(c) {
        var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
        if (mx !== mn) {
            var d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h /= 6;
        }
        return [h, s, l];
    }
    function hslToRgb(c) {
        var h = c[0], s = c[1], l = c[2];
        if (s === 0) return [l * 255, l * 255, l * 255];
        function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
        var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
        return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
    }
    // 色の指定（srgbClr / schemeClr など）を '#rrggbb' にする。なければ null
    function colorFrom(holder, theme) {
        if (!holder) return null;
        var c = null, hex = null;
        for (var k = holder.firstElementChild; k; k = k.nextElementSibling) {
            var n = k.localName;
            if (n === "srgbClr") { var v = String(k.getAttribute("val") || ""); if (/^[0-9a-fA-F]{6}$/.test(v)) { hex = v.toUpperCase(); c = k; break; } }
            else if (n === "schemeClr") { var nm = String(k.getAttribute("val") || ""); nm = SCHEME_ALIAS[nm] || nm; hex = (theme && theme.colors[nm]) || (nm === "phClr" ? (theme && theme.colors.accent1) : null) || "000000"; c = k; break; }
            else if (n === "sysClr") { var lv = String(k.getAttribute("lastClr") || ""); hex = /^[0-9a-fA-F]{6}$/.test(lv) ? lv.toUpperCase() : (k.getAttribute("val") === "window" ? "FFFFFF" : "000000"); c = k; break; }
            else if (n === "prstClr") { hex = PRESET[String(k.getAttribute("val") || "").toLowerCase()] || "000000"; c = k; break; }
        }
        if (!hex) return null;
        var rgb = hexToRgb(hex);
        for (var m = c.firstElementChild; m; m = m.nextElementSibling) {
            var val = num(m, "val", 100000) / 100000;
            if (m.localName === "lumMod" || m.localName === "lumOff") {
                var hsl = rgbToHsl(rgb);
                hsl[2] = m.localName === "lumMod" ? hsl[2] * val : hsl[2] + val;
                hsl[2] = Math.max(0, Math.min(1, hsl[2]));
                rgb = hslToRgb(hsl);
            } else if (m.localName === "tint") rgb = rgb.map(function (v) { return v * val + 255 * (1 - val); });
            else if (m.localName === "shade") rgb = rgb.map(function (v) { return v * val; });
        }
        return "#" + rgbToHex(rgb);
    }

    // ---------- 先に読むもの（テーマ・サイズ・スライドの順番） ----------
    function loadTheme(z) {
        var name = Object.keys(z.map).filter(function (n) { return /^ppt\/theme\/theme\d+\.xml$/.test(n); }).sort()[0];
        var theme = { colors: {}, major: "", minor: "", majorEa: "", minorEa: "" };
        if (!name) return Promise.resolve(theme);
        return readXml(z, name).then(function (root) {
            var cs = path(root, ["themeElements", "clrScheme"]);
            if (cs) for (var c = cs.firstElementChild; c; c = c.nextElementSibling) {
                var inner = c.firstElementChild;
                if (!inner) continue;
                var v = inner.localName === "srgbClr" ? inner.getAttribute("val") : inner.getAttribute("lastClr");
                if (v && /^[0-9a-fA-F]{6}$/.test(v)) theme.colors[c.localName] = v.toUpperCase();
            }
            var fs = path(root, ["themeElements", "fontScheme"]);
            function face(group, name) { var f = kid(kid(fs, group), name); return (f && f.getAttribute("typeface")) || ""; }
            theme.major = face("majorFont", "latin"); theme.minor = face("minorFont", "latin");
            theme.majorEa = face("majorFont", "ea"); theme.minorEa = face("minorFont", "ea");
            return theme;
        });
    }

    // ---------- 位置と文字の「引き継ぎ」（スライド → レイアウト → マスター） ----------
    function phOf(sp) { return path(sp, ["nvSpPr", "nvPr", "ph"]) || path(sp, ["nvPicPr", "nvPr", "ph"]) || path(sp, ["nvGraphicFramePr", "nvPr", "ph"]); }
    function phKey(ph) {
        var t = ph.getAttribute("type") || "body";
        if (t === "ctrTitle") t = "title";
        if (t === "subTitle") t = "body";
        return { type: t, idx: ph.getAttribute("idx") };
    }
    function findPh(tree, ph) {
        if (!tree || !ph) return null;
        var key = phKey(ph), best = null;
        var list = kids(tree, "sp").concat(kids(tree, "pic"), kids(tree, "graphicFrame"));
        for (var i = 0; i < list.length; i++) {
            var p = phOf(list[i]);
            if (!p) continue;
            var k = phKey(p);
            if (key.idx !== null && k.idx === key.idx) return list[i];
            if (k.type === key.type && !best) best = list[i];
        }
        return best;
    }
    function xfrmOf(sp) {
        var x = path(sp, ["spPr", "xfrm"]) || kid(sp, "xfrm") || path(sp, ["grpSpPr", "xfrm"]);
        if (!x) return null;
        var off = kid(x, "off"), ext = kid(x, "ext");
        if (!off || !ext) return null;
        return { x: num(off, "x", 0), y: num(off, "y", 0), cx: num(ext, "cx", 0), cy: num(ext, "cy", 0), rot: num(x, "rot", 0), flipH: x.getAttribute("flipH") === "1", flipV: x.getAttribute("flipV") === "1" };
    }
    function chainXfrm(sp, chain) {
        var x = xfrmOf(sp);
        if (x) return x;
        var ph = phOf(sp);
        if (!ph) return null;
        for (var i = 0; i < chain.length; i++) {
            var o = findPh(chain[i], ph);
            if (o && xfrmOf(o)) return xfrmOf(o);
        }
        return null;
    }

    // 段落の「何段目か」ごとの設定を、優先度の低い順に重ねる
    function mergeLvl(sources, lvl) {
        var out = { algn: null, marL: null, indent: null, buNone: false, buChar: null, buAuto: null, sz: null, b: null, i: null, u: null, color: null, latin: null, ea: null, lnPct: null, spcBef: null, spcAft: null };
        for (var s = sources.length - 1; s >= 0; s--) {
            var ls = sources[s];
            if (!ls) continue;
            var p = kid(ls, "lvl" + lvl + "pPr");
            if (!p) continue;
            applyPPr(out, p);
            applyRPr(out, kid(p, "defRPr"));
        }
        return out;
    }
    function applyPPr(out, p) {
        if (!p) return;
        if (p.getAttribute("algn")) out.algn = p.getAttribute("algn");
        if (p.getAttribute("marL") !== null) out.marL = num(p, "marL", 0);
        if (p.getAttribute("indent") !== null) out.indent = num(p, "indent", 0);
        if (kid(p, "buNone")) { out.buNone = true; out.buChar = null; out.buAuto = null; }
        var bc = kid(p, "buChar"); if (bc) { out.buNone = false; out.buChar = bc.getAttribute("char"); out.buAuto = null; }
        var ba = kid(p, "buAutoNum"); if (ba) { out.buNone = false; out.buAuto = ba.getAttribute("type") || "arabicPeriod"; out.buChar = null; }
        var ln = kid(p, "lnSpc"), lp = ln && kid(ln, "spcPct"); if (lp) out.lnPct = num(lp, "val", 100000) / 100000;
        var sb = kid(p, "spcBef"); if (sb) out.spcBef = spacing(sb);
        var sa = kid(p, "spcAft"); if (sa) out.spcAft = spacing(sa);
    }
    function spacing(el) {
        var pts = kid(el, "spcPts"), pct = kid(el, "spcPct");
        if (pts) return { pt: num(pts, "val", 0) / 100 };
        if (pct) return { pct: num(pct, "val", 0) / 100000 };
        return null;
    }
    function applyRPr(out, r, theme) {
        if (!r) return;
        if (r.getAttribute("sz")) out.sz = num(r, "sz", null);
        if (r.getAttribute("b") !== null) out.b = r.getAttribute("b") === "1";
        if (r.getAttribute("i") !== null) out.i = r.getAttribute("i") === "1";
        if (r.getAttribute("u")) out.u = r.getAttribute("u") !== "none";
        if (r.getAttribute("strike")) out.strike = r.getAttribute("strike") !== "noStrike";
        if (r.getAttribute("baseline")) out.baseline = num(r, "baseline", 0);
        var sf = kid(r, "solidFill"); if (sf) out.colorEl = sf;
        var la = kid(r, "latin"); if (la && la.getAttribute("typeface")) out.latin = la.getAttribute("typeface");
        var ea = kid(r, "ea"); if (ea && ea.getAttribute("typeface")) out.ea = ea.getAttribute("typeface");
    }

    // ---------- スライド 1 枚を描く ----------
    function makeCtx(z, theme, pres) { return { z: z, theme: theme, pres: pres, blobs: {}, media: {} }; }

    function fontFamily(name, theme, isEa) {
        var f = name || "";
        if (f === "+mj-lt") f = theme.major; else if (f === "+mn-lt") f = theme.minor;
        else if (f === "+mj-ea") f = theme.majorEa; else if (f === "+mn-ea") f = theme.minorEa;
        f = String(f).replace(/["'\\<>;{}()]/g, "").slice(0, 60);
        return f;
    }

    function px(emu) { return emu / PX; }

    function applyFill(el, spPr, theme, target) {
        if (!spPr) return;
        var solid = kid(spPr, "solidFill"), grad = kid(spPr, "gradFill");
        if (kid(spPr, "noFill")) { return; }
        if (solid) { var c = colorFrom(solid, theme); if (c) el.style.background = c; return; }
        if (grad) {
            var stops = kids(path(grad, ["gsLst"]), "gs").map(function (g) { var c = colorFrom(g, theme); return c ? c + " " + Math.max(0, Math.min(100, num(g, "pos", 0) / 1000)) + "%" : null; }).filter(Boolean);
            if (stops.length >= 2) {
                var lin = kid(grad, "lin"), ang = lin ? num(lin, "ang", 0) / 60000 : 90;
                el.style.background = "linear-gradient(" + (ang + 90) + "deg," + stops.join(",") + ")";
            } else if (stops.length === 1) el.style.background = stops[0].split(" ")[0];
        }
    }
    function applyLine(el, spPr, theme, isLineOnly) {
        var ln = kid(spPr, "ln");
        if (!ln || kid(ln, "noFill")) return null;
        var c = colorFrom(kid(ln, "solidFill"), theme);
        if (!c) return null;
        var w = Math.max(1, px(num(ln, "w", 12700)));
        var dash = kid(ln, "prstDash"), dv = dash ? dash.getAttribute("val") : "";
        var style = /dash|sysDot|sysDash/i.test(dv || "") ? (/dot/i.test(dv) ? "dotted" : "dashed") : "solid";
        if (!isLineOnly) el.style.border = w + "px " + style + " " + c;
        return { color: c, w: w, dash: style };
    }

    function geomStyle(el, spPr, w, h) {
        var g = path(spPr, ["prstGeom"]);
        var t = g ? g.getAttribute("prst") : "rect";
        if (t === "ellipse") el.style.borderRadius = "50%";
        else if (t === "roundRect") {
            var av = path(g, ["avLst"]), gd = av ? kid(av, "gd") : null;
            var adj = gd ? Number(String(gd.getAttribute("fmla") || "").replace(/[^0-9]/g, "")) / 100000 : 0.16667;
            el.style.borderRadius = Math.min(w, h) * (isFinite(adj) && adj > 0 ? adj : 0.16667) + "px";
        } else if (t === "triangle") el.style.clipPath = "polygon(50% 0,100% 100%,0 100%)";
        else if (t === "rtTriangle") el.style.clipPath = "polygon(0 0,100% 100%,0 100%)";
        else if (t === "diamond") el.style.clipPath = "polygon(50% 0,100% 50%,50% 100%,0 50%)";
        else if (t === "parallelogram") el.style.clipPath = "polygon(25% 0,100% 0,75% 100%,0 100%)";
        else if (t === "hexagon") el.style.clipPath = "polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)";
        else if (t === "rightArrow") el.style.clipPath = "polygon(0 25%,60% 25%,60% 0,100% 50%,60% 100%,60% 75%,0 75%)";
        else if (t === "leftArrow") el.style.clipPath = "polygon(100% 25%,40% 25%,40% 0,0 50%,40% 100%,40% 75%,100% 75%)";
        return t;
    }

    function boxFor(x, T) {
        var left = T.a * x.x + T.b, top = T.c * x.y + T.d, w = T.a * x.cx, h = T.c * x.cy;
        var d = document.createElement("div");
        d.className = "pp-s";
        d.style.left = px(left) + "px"; d.style.top = px(top) + "px";
        d.style.width = px(w) + "px"; d.style.height = px(h) + "px";
        var tr = [];
        if (x.rot) tr.push("rotate(" + (x.rot / 60000) + "deg)");
        if (x.flipH) tr.push("scaleX(-1)");
        if (x.flipV) tr.push("scaleY(-1)");
        if (tr.length) d.style.transform = tr.join(" ");
        return { el: d, w: px(w), h: px(h) };
    }

    // 文字（段落・文字の並び）を、parent の中に描く
    function renderText(parent, txBody, ctx, env, o) {
        if (!txBody) return;
        var theme = ctx.theme, bodyPr = kid(txBody, "bodyPr");
        var anchor = bodyPr ? bodyPr.getAttribute("anchor") : null;
        var fit = bodyPr && kid(bodyPr, "normAutofit");
        var fscale = fit ? (num(fit, "fontScale", 100000) / 100000) : 1;
        var lIns = bodyPr ? num(bodyPr, "lIns", 91440) : 91440, rIns = bodyPr ? num(bodyPr, "rIns", 91440) : 91440;
        var tIns = bodyPr ? num(bodyPr, "tIns", 45720) : 45720, bIns = bodyPr ? num(bodyPr, "bIns", 45720) : 45720;
        if (o && o.noInset) { lIns = rIns = tIns = bIns = 0; }
        var box = document.createElement("div");
        box.className = "pp-t";
        box.style.padding = px(tIns) + "px " + px(rIns) + "px " + px(bIns) + "px " + px(lIns) + "px";
        box.style.justifyContent = anchor === "ctr" ? "center" : anchor === "b" ? "flex-end" : "flex-start";
        if (bodyPr && bodyPr.getAttribute("wrap") === "none") box.style.whiteSpace = "pre";
        var vert = bodyPr ? bodyPr.getAttribute("vert") : "";
        if (vert === "eaVert" || vert === "vert") { box.style.writingMode = "vertical-rl"; }
        var own = kid(txBody, "lstStyle");
        var counters = {};
        kids(txBody, "p").forEach(function (p) {
            var pPr = kid(p, "pPr"), lvl = pPr ? num(pPr, "lvl", 0) + 1 : 1;
            var sources = [own].concat(env.lst);
            var base = mergeLvl(sources, lvl);
            // 段落 pPr で上書き
            applyPPr(base, pPr);
            // 見出し・本文などの基本の大きさ
            var dflt = env.styles ? mergeLvl([env.styles], lvl) : null;
            var para = document.createElement("div");
            para.className = "pp-p";
            var algn = base.algn || (dflt && dflt.algn) || "l";
            para.style.textAlign = algn === "ctr" ? "center" : algn === "r" ? "right" : algn === "just" ? "justify" : "left";
            var marL = base.marL !== null ? base.marL : (dflt && dflt.marL !== null ? dflt.marL : 0);
            var indent = base.indent !== null ? base.indent : (dflt && dflt.indent !== null ? dflt.indent : 0);
            para.style.paddingLeft = px(marL) + "px";
            para.style.textIndent = px(indent) + "px";
            var lnPct = base.lnPct !== null ? base.lnPct : (dflt && dflt.lnPct !== null ? dflt.lnPct : null);
            para.style.lineHeight = String(lnPct ? 1.2 * lnPct : 1.2);
            var sb = base.spcBef || (dflt && dflt.spcBef), sa = base.spcAft || (dflt && dflt.spcAft);
            function sp(v, szPt) { return v ? (v.pt !== undefined ? v.pt * 96 / 72 : (v.pct || 0) * szPt * 96 / 72 * 1.2) : 0; }
            // 文字の大きさ（段落のはじめの文字から）
            var defSz = (base.sz !== null ? base.sz : (dflt && dflt.sz !== null ? dflt.sz : 1800)) / 100;
            if (sb) para.style.marginTop = sp(sb, defSz) + "px";
            if (sa) para.style.marginBottom = sp(sa, defSz) + "px";
            // 箇条書き
            var buNone = base.buNone || (dflt && dflt.buNone && !base.buChar && !base.buAuto);
            var buChar = base.buChar || (dflt && !base.buNone ? dflt.buChar : null);
            var buAuto = base.buAuto || (dflt && !base.buNone ? dflt.buAuto : null);
            var hasText = desc(p, "t").some(function (t) { return t.textContent; });
            if (!buNone && (buChar || buAuto) && hasText) {
                var mark = document.createElement("span");
                mark.className = "pp-bu";
                if (buAuto) {
                    counters[lvl] = (counters[lvl] || 0) + 1;
                    var n = counters[lvl], t = String(buAuto);
                    var s = /^alphaLc/.test(t) ? String.fromCharCode(96 + ((n - 1) % 26) + 1) : /^alphaUc/.test(t) ? String.fromCharCode(64 + ((n - 1) % 26) + 1) : String(n);
                    mark.textContent = s + (/ParenR$/.test(t) ? ")" : /ParenBoth$/.test(t) ? ")" : ".") + "\u00a0";
                } else {
                    var ch = String(buChar || "•");
                    mark.textContent = ({ "§": "▪", "Ø": "➢", "ü": "✓", "q": "❑", "v": "❖" }[ch] || ch) + "\u00a0";
                    counters[lvl] = 0;
                }
                mark.style.fontSize = defSz * 96 / 72 * fscale + "px";
                para.appendChild(mark);
            } else { counters[lvl] = 0; }
            // 文字のかたまり
            var made = false;
            for (var c = p.firstElementChild; c; c = c.nextElementSibling) {
                if (c.localName === "br") { para.appendChild(document.createElement("br")); made = true; continue; }
                if (c.localName !== "r" && c.localName !== "fld") continue;
                var rPr = kid(c, "rPr");
                // 下から順に：文字の基本 → 段落の基本 → この文字
                var eff = mergeLvl(sources, lvl);
                if (dflt) { ["sz", "b", "i", "u", "latin", "ea"].forEach(function (k) { if (eff[k] === null || eff[k] === undefined) eff[k] = dflt[k]; }); if (!eff.colorEl && dflt.colorEl) eff.colorEl = dflt.colorEl; }
                applyRPr(eff, rPr);
                var span = document.createElement("span");
                var text = "";
                if (c.localName === "fld" && /slidenum/i.test(c.getAttribute("type") || "")) text = String(env.number);
                else text = kids(c, "t").map(function (t) { return t.textContent; }).join("");
                span.textContent = text;
                var szPt = (eff.sz !== null && eff.sz !== undefined ? eff.sz : 1800) / 100;
                if (eff.baseline) szPt *= 0.65;
                span.style.fontSize = szPt * 96 / 72 * fscale + "px";
                if (eff.b) span.style.fontWeight = "700";
                if (eff.i) span.style.fontStyle = "italic";
                var dec = []; if (eff.u) dec.push("underline"); if (eff.strike) dec.push("line-through");
                if (dec.length) span.style.textDecoration = dec.join(" ");
                if (eff.baseline) span.style.verticalAlign = eff.baseline > 0 ? "super" : "sub";
                var col = colorFrom(eff.colorEl, theme) || env.defColor;
                if (col) span.style.color = col;
                var fam2 = fontFamily(eff.latin, theme);
                var famList = [];
                if (fam2) famList.push('"' + fam2 + '"');
                if (eff.ea) { var e2 = fontFamily(eff.ea, theme); if (e2) famList.push('"' + e2 + '"'); }
                if (famList.length) span.style.fontFamily = famList.join(",") + ",system-ui,sans-serif";
                para.appendChild(span);
                made = true;
            }
            if (!made) {            // からの段落でも、高さは残す
                var endP = kid(p, "endParaRPr"), z0 = document.createElement("span");
                z0.textContent = "\u200b";
                z0.style.fontSize = ((endP && endP.getAttribute("sz") ? num(endP, "sz", 1800) : defSz * 100) / 100) * 96 / 72 * fscale + "px";
                para.appendChild(z0);
            }
            box.appendChild(para);
        });
        parent.appendChild(box);
    }

    function mimeOfMedia(name) {
        var e = (/\.([A-Za-z0-9]+)$/.exec(name) || [])[1];
        e = e ? e.toLowerCase() : "";
        return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", bmp: "image/bmp" }[e] || "";
    }
    function mediaUrl(ctx, name) {
        if (!name) return Promise.resolve(null);
        if (ctx.blobs[name] !== undefined) return Promise.resolve(ctx.blobs[name]);
        var mime = mimeOfMedia(name);
        if (!mime) { ctx.blobs[name] = null; return Promise.resolve(null); }       // svg・emf・wmf などは出さない
        return extract(ctx.z, name).then(function (bytes) {
            ctx.blobs[name] = bytes ? URL.createObjectURL(new Blob([bytes], { type: mime })) : null;
            return ctx.blobs[name];
        }).catch(function () { ctx.blobs[name] = null; return null; });
    }

    // 1つの図形（sp / pic / grpSp / graphicFrame / cxnSp）
    var budget = 0;
    function renderNode(node, parent, ctx, env, T, tasks) {
        var n = node.localName;
        if (--budget < 0) return;                      // 1 枚に 3000 個をこえる部品は、描かない（重くなりすぎないように）
        if (n === "grpSp") {
            var gx = xfrmOf(node), gp = kid(node, "grpSpPr"), xf = gp && kid(gp, "xfrm");
            var chOff = xf && kid(xf, "chOff"), chExt = xf && kid(xf, "chExt");
            var T2 = T;
            if (gx && chOff && chExt && num(chExt, "cx", 0) > 0 && num(chExt, "cy", 0) > 0) {
                var sx = gx.cx / num(chExt, "cx", 1), sy = gx.cy / num(chExt, "cy", 1);
                var offX = gx.x - num(chOff, "x", 0) * sx, offY = gx.y - num(chOff, "y", 0) * sy;
                T2 = { a: T.a * sx, b: T.a * offX + T.b, c: T.c * sy, d: T.c * offY + T.d };
            }
            for (var c = node.firstElementChild; c; c = c.nextElementSibling) renderNode(c, parent, ctx, env, T2, tasks);
            return;
        }
        if (n !== "sp" && n !== "pic" && n !== "graphicFrame" && n !== "cxnSp") return;
        var ph = phOf(node);
        var x = chainXfrm(node, env.chain);
        if (!x) return;
        var b = boxFor(x, T);
        if (b.w <= 0 && b.h <= 0) return;
        parent.appendChild(b.el);
        if (n === "pic") {
            var blip = desc(kid(node, "blipFill"), "blip")[0];
            var rid = blip && (blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") || blip.getAttribute("r:embed"));
            var rel = rid && env.rels[rid];
            var src = kid(kid(node, "blipFill"), "srcRect");
            tasks.push(mediaUrl(ctx, rel && rel.target).then(function (url) {
                if (!url) { b.el.classList.add("pp-ph"); b.el.textContent = "（この画像は表示できません）"; return; }
                var img = document.createElement("img");
                img.draggable = false; img.alt = ""; img.src = url;
                var l = src ? num(src, "l", 0) / 100000 : 0, t = src ? num(src, "t", 0) / 100000 : 0, r = src ? num(src, "r", 0) / 100000 : 0, bt = src ? num(src, "b", 0) / 100000 : 0;
                if (l || t || r || bt) {
                    var wRatio = 1 / Math.max(0.01, 1 - l - r), hRatio = 1 / Math.max(0.01, 1 - t - bt);
                    img.style.position = "absolute"; img.style.width = wRatio * 100 + "%"; img.style.height = hRatio * 100 + "%";
                    img.style.left = -l * wRatio * 100 + "%"; img.style.top = -t * hRatio * 100 + "%"; img.style.maxWidth = "none";
                } else { img.style.width = "100%"; img.style.height = "100%"; img.style.objectFit = "fill"; }
                b.el.style.overflow = "hidden";
                b.el.appendChild(img);
            }));
            applyLine(b.el, kid(node, "spPr"), ctx.theme, false);
            return;
        }
        if (n === "graphicFrame") {
            var tbl = desc(node, "tbl")[0];
            if (tbl) renderTable(b, tbl, ctx, env);
            else { b.el.classList.add("pp-ph"); b.el.textContent = desc(node, "chart").length ? "（グラフはここでは表示できません。元のアプリで見てください）" : "（この部品はここでは表示できません）"; }
            return;
        }
        var spPr = kid(node, "spPr");
        // 図形そのもの（なければ、レイアウトの同じ場所の見た目）
        var look = spPr;
        if (ph && (!spPr || (!kid(spPr, "solidFill") && !kid(spPr, "gradFill") && !kid(spPr, "noFill")))) {
            for (var i = 0; i < env.chain.length; i++) { var o = findPh(env.chain[i], ph); if (o && kid(o, "spPr") && (kid(kid(o, "spPr"), "solidFill") || kid(kid(o, "spPr"), "gradFill"))) { look = kid(o, "spPr"); break; } }
        }
        var geom = path(spPr, ["prstGeom"]), gtype = geom ? geom.getAttribute("prst") : "rect";
        if (n === "cxnSp" || gtype === "line" || gtype === "straightConnector1") {
            var ln = applyLine(b.el, spPr, ctx.theme, true) || { color: "#888", w: 1, dash: "solid" };
            var svg = document.createElementNS(TXT, "svg");
            svg.setAttribute("width", String(Math.max(1, b.w))); svg.setAttribute("height", String(Math.max(1, b.h)));
            svg.style.overflow = "visible";
            var line = document.createElementNS(TXT, "line");
            line.setAttribute("x1", "0"); line.setAttribute("y1", "0"); line.setAttribute("x2", String(b.w)); line.setAttribute("y2", String(b.h));
            line.setAttribute("stroke", ln.color); line.setAttribute("stroke-width", String(ln.w));
            if (ln.dash !== "solid") line.setAttribute("stroke-dasharray", ln.dash === "dotted" ? ln.w + " " + ln.w * 2 : ln.w * 4 + " " + ln.w * 2);
            svg.appendChild(line); b.el.appendChild(svg);
            return;
        }
        applyFill(b.el, look, ctx.theme);
        geomStyle(b.el, spPr, b.w, b.h);
        applyLine(b.el, spPr, ctx.theme, false);
        var body = kid(node, "txBody");
        if (body) {
            var lst = [], styles = null;
            if (ph) {
                for (var j = 0; j < env.chain.length; j++) {
                    var o2 = findPh(env.chain[j], ph);
                    if (o2) lst.push(path(o2, ["txBody", "lstStyle"]));
                }
                var k = phKey(ph).type;
                styles = k === "title" ? env.titleStyle : (k === "body" ? env.bodyStyle : env.otherStyle);
            } else { styles = env.plainStyle; }
            var env2 = { chain: env.chain, rels: env.rels, lst: lst, styles: styles, number: env.number, defColor: env.defColor };
            renderText(b.el, body, ctx, env2);
        }
    }

    function renderTable(b, tbl, ctx, env) {
        var cols = kids(path(tbl, ["tblGrid"]), "gridCol").map(function (g) { return num(g, "w", 914400); });
        var pr = kid(tbl, "tblPr"), firstRow = pr && pr.getAttribute("firstRow") === "1", band = pr && pr.getAttribute("bandRow") === "1";
        var table = document.createElement("table");
        table.className = "pp-tbl";
        var cg = document.createElement("colgroup");
        cols.forEach(function (w) { var c = document.createElement("col"); c.style.width = px(w) + "px"; cg.appendChild(c); });
        table.appendChild(cg);
        var acc = ctx.theme.colors.accent1 ? "#" + ctx.theme.colors.accent1 : "#4472c4";
        kids(tbl, "tr").forEach(function (tr, ri) {
            var row = document.createElement("tr");
            row.style.height = px(num(tr, "h", 370840)) + "px";
            kids(tr, "tc").forEach(function (tc) {
                if (tc.getAttribute("hMerge") === "1" || tc.getAttribute("vMerge") === "1") return;
                var cell = document.createElement("td");
                if (num(tc, "gridSpan", 1) > 1) cell.colSpan = num(tc, "gridSpan", 1);
                if (num(tc, "rowSpan", 1) > 1) cell.rowSpan = num(tc, "rowSpan", 1);
                var tcPr = kid(tc, "tcPr"), fill = tcPr && colorFrom(kid(tcPr, "solidFill"), ctx.theme);
                var defColor = null;
                if (fill) cell.style.background = fill;
                else if (firstRow && ri === 0) { cell.style.background = acc; defColor = "#ffffff"; cell.style.fontWeight = "700"; }
                else if (band) cell.style.background = ri % 2 ? "rgba(128,128,128,.16)" : "rgba(128,128,128,.07)";
                var inner = document.createElement("div");
                cell.appendChild(inner);
                var env2 = { chain: [], rels: env.rels, lst: [], styles: null, number: env.number, defColor: defColor };
                renderText(inner, kid(tc, "txBody"), ctx, env2, { noInset: false });
                row.appendChild(cell);
            });
            table.appendChild(row);
        });
        b.el.appendChild(table);
    }

    // ---------- スライドの背景 ----------
    function applyBackground(stage, parts, ctx, tasks) {
        for (var i = 0; i < parts.length; i++) {
            var part = parts[i];
            var bg = part && path(part.root, ["cSld", "bg"]);
            if (!bg) continue;
            var bgPr = kid(bg, "bgPr"), ref = kid(bg, "bgRef");
            if (bgPr) {
                if (kid(bgPr, "blipFill")) {
                    var blip = desc(kid(bgPr, "blipFill"), "blip")[0];
                    var rid = blip && (blip.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "embed") || blip.getAttribute("r:embed"));
                    var rel = rid && part.rels[rid];
                    if (rel) tasks.push(mediaUrl(ctx, rel.target).then(function (url) { if (url) { stage.style.backgroundImage = "url(" + url + ")"; stage.style.backgroundSize = "100% 100%"; } }));
                    return;
                }
                var t = document.createElement("div");
                applyFill(t, bgPr, ctx.theme);
                if (t.style.background) { stage.style.background = t.style.background; return; }
            } else if (ref) {
                var c = colorFrom(ref, ctx.theme);
                if (c) { stage.style.background = c; return; }
            }
        }
        stage.style.background = "#ffffff";
    }

    // 1 枚のスライドを、DOM（pp-stage）にして返す
    function buildSlide(ctx, slide) {
        var tasks = [];
        budget = 3000;
        var stage = document.createElement("div");
        stage.className = "pp-stage";
        stage.style.width = px(ctx.pres.cx) + "px"; stage.style.height = px(ctx.pres.cy) + "px";
        applyBackground(stage, [slide, slide.layout, slide.master], ctx, tasks);
        var T = { a: 1, b: 0, c: 1, d: 0 };
        var chain = [slide.layout && path(slide.layout.root, ["cSld", "spTree"]), slide.master && path(slide.master.root, ["cSld", "spTree"])].filter(Boolean);
        var styles = slide.master && kid(slide.master.root, "txStyles");
        var envBase = {
            chain: chain, lst: [], number: slide.number, defColor: "#000000",
            titleStyle: kid(styles, "titleStyle"), bodyStyle: kid(styles, "bodyStyle"), otherStyle: kid(styles, "otherStyle"), plainStyle: ctx.pres.defaultTextStyle
        };
        var tx1 = ctx.theme.colors.dk1 ? "#" + ctx.theme.colors.dk1 : "#000000";
        envBase.defColor = tx1;
        function layer(part, isSlide) {
            if (!part) return;
            var tree = path(part.root, ["cSld", "spTree"]);
            var env = Object.assign({}, envBase, { rels: part.rels });
            for (var c = tree && tree.firstElementChild; c; c = c.nextElementSibling) {
                if (!isSlide && phOf(c)) continue;                         // レイアウト・マスターの「場所の枠」は、スライドに出ない
                renderNode(c, stage, ctx, env, T, tasks);
            }
        }
        var showMaster = slide.root.getAttribute("showMasterSp") !== "0";
        if (showMaster && !(slide.layout && slide.layout.root.getAttribute("showMasterSp") === "0")) layer(slide.master, false);
        if (showMaster) layer(slide.layout, false);
        layer(slide, true);
        return Promise.all(tasks).then(function () { return stage; });
    }

    // ---------- 全体を読む ----------
    function loadDeck(bytes) {
        var z = openZip(bytes), theme, pres, ctx;
        return Promise.all([loadTheme(z), readXml(z, "ppt/presentation.xml"), loadRels(z, "ppt/presentation.xml")]).then(function (r) {
            theme = r[0];
            var root = r[1], rels = r[2];
            if (!root) throw new Error("pptx");
            var sz = kid(root, "sldSz");
            pres = { cx: num(sz, "cx", 9144000), cy: num(sz, "cy", 6858000), defaultTextStyle: kid(root, "defaultTextStyle") };
            if (!(pres.cx > 0 && pres.cx < 91440000) || !(pres.cy > 0 && pres.cy < 91440000)) { pres.cx = 9144000; pres.cy = 6858000; }
            ctx = makeCtx(z, theme, pres);
            var ids = kids(kid(root, "sldIdLst"), "sldId").slice(0, MAX_SLIDES);
            var list = [];
            ids.forEach(function (s, i) {
                var rid = s.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") || s.getAttribute("r:id");
                var rel = rels[rid];
                if (rel && z.map[rel.target]) list.push({ part: rel.target, number: i + 1 });
            });
            return { ctx: ctx, list: list };
        });
    }
    var partCache = {};
    function loadPart(ctx, part) {
        if (partCache[part]) return partCache[part];
        partCache[part] = Promise.all([readXml(ctx.z, part), loadRels(ctx.z, part)]).then(function (r) { return r[0] ? { root: r[0], rels: r[1], path: part } : null; });
        return partCache[part];
    }
    var slideCache = {};
    function loadSlide(ctx, ent) {
        if (slideCache[ent.part]) return slideCache[ent.part];
        slideCache[ent.part] = loadPart(ctx, ent.part).then(function (slide) {
            if (!slide) throw new Error("slide");
            slide.number = ent.number;
            var lrel = null, k;
            for (k in slide.rels) if (slide.rels[k].type === "slideLayout") lrel = slide.rels[k];
            return (lrel ? loadPart(ctx, lrel.target) : Promise.resolve(null)).then(function (layout) {
                slide.layout = layout;
                var mrel = null;
                if (layout) for (k in layout.rels) if (layout.rels[k].type === "slideMaster") mrel = layout.rels[k];
                return (mrel ? loadPart(ctx, mrel.target) : Promise.resolve(null)).then(function (master) {
                    slide.master = master;
                    var nrel = null;
                    for (k in slide.rels) if (slide.rels[k].type === "notesSlide") nrel = slide.rels[k];
                    return (nrel ? loadPart(ctx, nrel.target) : Promise.resolve(null)).then(function (notes) {
                        slide.notes = "";
                        if (notes) {
                            var tree = path(notes.root, ["cSld", "spTree"]);
                            kids(tree, "sp").forEach(function (sp) {
                                var ph = phOf(sp);
                                if (ph && ph.getAttribute("type") === "body") slide.notes = kids(path(sp, ["txBody"]), "p").map(function (p) { return desc(p, "t").map(function (t) { return t.textContent; }).join(""); }).join("\n").trim();
                            });
                        }
                        slide.hidden = slide.root.getAttribute("show") === "0";
                        return slide;
                    });
                });
            });
        });
        return slideCache[ent.part];
    }

    // ---------- 画面（一覧・スライドショー） ----------
    function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }

    function fit(frame, stage, pres) {
        var w = frame.clientWidth, h = frame.clientHeight;
        if (!w || !h) return;
        var k = Math.min(w / px(pres.cx), h / px(pres.cy));
        stage.style.transform = "scale(" + k + ")";
        stage.style.left = (w - px(pres.cx) * k) / 2 + "px"; stage.style.top = (h - px(pres.cy) * k) / 2 + "px";
    }

    function open(opts) {
        var main = opts.main, meta = opts.meta, bytes = opts.bytes;
        var showBtn = opts.showBtn, hereBtn = opts.hereBtn, note = opts.note;
        return loadDeck(bytes).then(function (deck) {
            var ctx = deck.ctx, list = deck.list, pres = ctx.pres;
            if (!list.length) { note("このファイルには、表示できるスライドがありませんでした。<br><b>ダウンロード</b>して、お使いのアプリで開いてください。"); return; }
            meta.textContent = "PowerPoint ・ " + list.length + " 枚" + (list.length >= MAX_SLIDES ? "（最初の " + MAX_SLIDES + " 枚まで）" : "");
            var wrap = el("div", "pp-list");
            main.textContent = ""; main.appendChild(wrap);
            var frames = [], cur = 0;

            function fillFrame(i) {
                var f = frames[i];
                if (f.state) return;
                f.state = 1;
                loadSlide(ctx, list[i]).then(function (slide) {
                    return buildSlide(ctx, slide).then(function (stage) {
                        f.holder.textContent = ""; f.holder.appendChild(stage); f.stage = stage;
                        fit(f.holder, stage, pres);
                        if (slide.notes) { f.notes.textContent = "📝 " + slide.notes; f.notes.hidden = false; }
                        if (slide.hidden && f.cap.textContent.indexOf("非表示") < 0) f.cap.textContent += "（非表示のスライド）";
                        f.hidden = slide.hidden; f.state = 2;
                    });
                }).catch(function () { f.holder.textContent = "このスライドは表示できませんでした"; f.state = 2; });
            }

            list.forEach(function (ent, i) {
                var item = el("div", "pp-item");
                var holder = el("div", "pp-frame");
                holder.style.aspectRatio = pres.cx + " / " + pres.cy;
                var cap = el("div", "pp-cap", (i + 1) + " / " + list.length);
                var go = el("button", "pp-go", "▶ ここから");
                go.type = "button";
                go.addEventListener("click", function () { cur = i; startShow(i); });
                var bar = el("div", "pp-bar"); bar.appendChild(cap); bar.appendChild(go);
                var notes = el("div", "pp-notes"); notes.hidden = true;
                item.appendChild(holder); item.appendChild(bar); item.appendChild(notes);
                wrap.appendChild(item);
                frames.push({ item: item, holder: holder, cap: cap, notes: notes, state: 0, stage: null, hidden: false });
            });

            var io = new IntersectionObserver(function (entries) {
                entries.forEach(function (e) { if (e.isIntersecting) fillFrame(frames.findIndex(function (f) { return f.item === e.target; })); });
            }, { root: main, rootMargin: "1200px 0px", threshold: 0 });
            frames.forEach(function (f) { io.observe(f.item); });

            function refit() { frames.forEach(function (f) { if (f.stage) fit(f.holder, f.stage, pres); }); }
            if (typeof ResizeObserver === "function") new ResizeObserver(refit).observe(main); else window.addEventListener("resize", refit);

            function updateCur() {
                var mid = main.getBoundingClientRect().top + main.clientHeight / 2, best = 0, bd = Infinity;
                frames.forEach(function (f, i) { var r = f.item.getBoundingClientRect(), d = Math.abs((r.top + r.bottom) / 2 - mid); if (d < bd) { bd = d; best = i; } });
                cur = best;
            }
            main.addEventListener("scroll", updateCur, { passive: true });

            // ----- スライドショー -----
            var show = null;
            function startShow(from) {
                if (show) return;
                var order = list.map(function (_e, i) { return i; });          // はじめは全部。すぐあとで、非表示のスライドをのぞく
                var pos = Math.max(0, order.indexOf(from));
                var root = el("div", "pp-show");
                root.setAttribute("role", "dialog"); root.setAttribute("aria-label", "スライドショー");
                var holder = el("div", "pp-showframe");
                var hud = el("div", "pp-hud");
                var prev = el("button", "pp-b", "◀"), next = el("button", "pp-b", "▶"), auto = el("button", "pp-b pp-auto", "⏵ 自動で進める"), close = el("button", "pp-b", "✕ とじる");
                var count = el("span", "pp-count");
                [prev, count, next, auto, close].forEach(function (b) { if (b.tagName === "BUTTON") b.type = "button"; hud.appendChild(b); });
                var noteBox = el("div", "pp-shownote"); noteBox.hidden = true;
                root.appendChild(holder); root.appendChild(hud); root.appendChild(noteBox);
                document.body.appendChild(root);
                document.body.classList.add("pp-open");
                var timer = null, hideTimer = null, lock = null, swipedAt = 0, token = 0;
                show = root;

                function draw() {
                    var my = ++token;
                    var idx = order[pos];
                    count.textContent = (idx + 1) + " / " + list.length;
                    prev.disabled = pos <= 0; next.disabled = pos >= order.length - 1;
                    loadSlide(ctx, list[idx]).then(function (slide) {
                        return buildSlide(ctx, slide).then(function (stage) {
                            if (my !== token) return;
                            holder.textContent = ""; holder.appendChild(stage);
                            fit(holder, stage, pres);
                            holder.__stage = stage;
                            if (slide.notes) { noteBox.textContent = slide.notes; } else noteBox.textContent = "";
                            noteBox.hidden = !(noteBox.textContent && noteBox.dataset.on === "1");
                        });
                    }).catch(function () { if (my === token) holder.textContent = "このスライドは表示できませんでした"; });
                    // 次の1枚を先に読んでおく
                    if (pos + 1 < order.length) loadSlide(ctx, list[order[pos + 1]]).catch(function () { /* 何もしない */ });
                }
                function go(d) {
                    var np = Math.max(0, Math.min(order.length - 1, pos + d));
                    if (np === pos) { if (d > 0 && timer) stopAuto(); return; }
                    pos = np; draw();
                    // 見ていた場所を、一覧にも反映
                    frames[order[pos]].item.scrollIntoView({ block: "center" });
                }
                function stopAuto() { if (timer) { clearInterval(timer); timer = null; } auto.textContent = "⏵ 自動で進める"; }
                function toggleAuto() {
                    if (timer) { stopAuto(); return; }
                    auto.textContent = "⏸ 自動をとめる";
                    timer = setInterval(function () { if (pos >= order.length - 1) stopAuto(); else go(1); }, 6000);
                }
                function wake() {
                    root.classList.remove("pp-idle");
                    clearTimeout(hideTimer);
                    hideTimer = setTimeout(function () { root.classList.add("pp-idle"); }, 2600);
                }
                function onKey(e) {
                    var k = e.key;
                    if (k === "Escape") { e.preventDefault(); end(); return; }
                    if (k === "ArrowRight" || k === "ArrowDown" || k === "PageDown" || k === " " || k === "Enter" || k === "n") { e.preventDefault(); go(1); }
                    else if (k === "ArrowLeft" || k === "ArrowUp" || k === "PageUp" || k === "Backspace" || k === "p") { e.preventDefault(); go(-1); }
                    else if (k === "Home") { e.preventDefault(); pos = 0; draw(); }
                    else if (k === "End") { e.preventDefault(); pos = order.length - 1; draw(); }
                    else if (k === "m" || k === "M") { noteBox.dataset.on = noteBox.dataset.on === "1" ? "0" : "1"; noteBox.hidden = !(noteBox.textContent && noteBox.dataset.on === "1"); }
                    wake();
                }
                function onResize() { if (holder.__stage) fit(holder, holder.__stage, pres); }
                function end() {
                    stopAuto(); clearTimeout(hideTimer);
                    document.removeEventListener("keydown", onKey, true);
                    window.removeEventListener("resize", onResize);
                    document.removeEventListener("fullscreenchange", onFs);
                    if (lock) { try { lock.release(); } catch (_e) { /* 何もしない */ } }
                    if (document.fullscreenElement) { try { document.exitFullscreen(); } catch (_e) { /* 何もしない */ } }
                    root.remove(); document.body.classList.remove("pp-open"); show = null;
                    try { frames[order[pos]].item.scrollIntoView({ block: "center" }); } catch (_e) { /* 何もしない */ }
                }
                function onFs() { if (!document.fullscreenElement && show === root && root.__wantFs) end(); }
                prev.addEventListener("click", function () { go(-1); });
                next.addEventListener("click", function () { go(1); });
                auto.addEventListener("click", toggleAuto);
                close.addEventListener("click", end);
                holder.addEventListener("click", function (e) {
                    if (Date.now() - swipedAt < 400) return;
                    var r = holder.getBoundingClientRect();
                    go(e.clientX - r.left < r.width * 0.3 ? -1 : 1);
                    wake();
                });
                var sx = 0, sy = 0;
                holder.addEventListener("touchstart", function (e) { if (e.touches.length === 1) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
                holder.addEventListener("touchend", function (e) {
                    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
                    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { swipedAt = Date.now(); go(dx < 0 ? 1 : -1); wake(); }
                }, { passive: true });
                root.addEventListener("mousemove", wake);
                root.addEventListener("touchstart", wake, { passive: true });
                document.addEventListener("keydown", onKey, true);
                window.addEventListener("resize", onResize);
                document.addEventListener("fullscreenchange", onFs);
                try {
                    if (root.requestFullscreen) root.requestFullscreen().then(function () { root.__wantFs = true; }).catch(function () { /* 全画面にできない（iPhone など）ときは、画面いっぱいの表示のまま */ });
                } catch (_e) { /* 何もしない */ }
                try { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request("screen").then(function (l) { lock = l; }).catch(function () { /* 何もしない */ }); } catch (_e) { /* 何もしない */ }
                draw(); wake();
                close.focus({ preventScroll: true });
                // 「非表示のスライド」は とばす（PowerPoint と同じ）。全部の印を読んだら、順番を作りなおす
                Promise.all(list.map(function (ent) { return loadSlide(ctx, ent).then(function (sl) { return sl.hidden; }, function () { return false; }); })).then(function (hid) {
                    if (show !== root) return;
                    var here = order[pos];
                    order = list.map(function (_e, i) { return i; }).filter(function (i) { return !hid[i] || i === here; });
                    pos = Math.max(0, order.indexOf(here));
                    hid.forEach(function (h, i) { if (h && frames[i] && frames[i].cap.textContent.indexOf("非表示") < 0) frames[i].cap.textContent += "（非表示のスライド）"; });
                    count.textContent = (here + 1) + " / " + list.length;
                    prev.disabled = pos <= 0; next.disabled = pos >= order.length - 1;
                });
            }

            showBtn.hidden = false; hereBtn.hidden = false;
            showBtn.onclick = function () { startShow(0); };
            hereBtn.onclick = function () { updateCur(); startShow(cur); };
            document.addEventListener("keydown", function (e) {
                if (show || e.ctrlKey || e.metaKey || e.altKey) return;
                if (e.key === "F5") { e.preventDefault(); startShow(e.shiftKey ? cur : 0); }
            });
        });
    }

    window.AREPptx = { open: open };
})();
