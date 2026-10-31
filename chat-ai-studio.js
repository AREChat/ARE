"use strict";

const AI_STUDIO_SPACES = {image:"black-forest-labs/FLUX.1-schnell",video:"ByteDance/AnimateDiff-Lightning"};
const AI_STUDIO_HOSTS = {image:"https://black-forest-labs-flux-1-schnell.hf.space",video:"https://bytedance-animatediff-lightning.hf.space"};
const AI_STUDIO_CLIENT_URL = "https://cdn.jsdelivr.net/npm/@gradio/client@2.7.1/dist/index.min.js";
let aiStudioClientModule = null;
let aiStudioBlobUrl = "";

function initAiStudio(){
    if(!window.aiStudioCleanupBound){
        el.profileModal.addEventListener("click",(event) => { if(event.target === el.profileModal) aiStudioClearPreview(); });
        window.aiStudioCleanupBound = true;
    }
}

function openAiStudio(){
    aiStudioClearPreview();
    el.profileSheet.className = "sheet ai-studio-sheet";
    el.profileSheet.innerHTML = '<h2 style="margin:0">✨ AI画像・動画生成</h2>' +
        '<div class="ai-studio-note">Hugging Faceの無料公開モデルを使います。入力した文章はHugging Faceへ送られ、生成したファイルはこの端末へ直接保存します。AREやSupabaseには保存しません。</div>' +
        '<div class="ai-studio-grid"><label class="ai-studio-field" for="aiStudioMode">生成するもの<select id="aiStudioMode"><option value="image">画像</option><option value="video">短い動画</option></select></label>' +
        '<label class="ai-studio-field" for="aiStudioSteps"><span id="aiStudioStepsLabel">画像の品質</span><select id="aiStudioSteps"><option value="4">標準（4-step）</option><option value="2">高速（2-step）</option><option value="8">高品質（8-step）</option><option value="1">最速（1-step）</option></select></label></div>' +
        '<label class="ai-studio-field" for="aiStudioPrompt">作りたい画像・動画の説明<textarea id="aiStudioPrompt" maxlength="500" placeholder="例：雨上がりのアカリ市の路地、夜、ネオンの反射、映画のような雰囲気" required></textarea></label>' +
        '<div class="ai-studio-grid" id="aiStudioVideoOptions" hidden><label class="ai-studio-field" for="aiStudioBase">動画の画風<select id="aiStudioBase"><option value="ToonYou">アニメ風（ToonYou）</option><option value="epiCRealism">写実風（epiCRealism）</option></select></label>' +
        '<label class="ai-studio-field" for="aiStudioMotion">カメラの動き<select id="aiStudioMotion"><option value="">標準</option><option value="guoyww/animatediff-motion-lora-zoom-in">ズームイン</option><option value="guoyww/animatediff-motion-lora-zoom-out">ズームアウト</option><option value="guoyww/animatediff-motion-lora-tilt-up">上に傾ける</option><option value="guoyww/animatediff-motion-lora-tilt-down">下に傾ける</option><option value="guoyww/animatediff-motion-lora-pan-left">左にパン</option><option value="guoyww/animatediff-motion-lora-pan-right">右にパン</option></select></label></div>' +
        '<label class="ai-studio-field" for="aiStudioToken">Hugging Faceのアクセストークン（任意）<input id="aiStudioToken" type="password" autocomplete="off" spellcheck="false" placeholder="hf_...（この画面を閉じると破棄）"></label>' +
        '<div class="ai-studio-note">無料アカウントは1日5 GPU分が目安で、画像・動画など全ZeroGPU利用の合計です。トークンなしでも試せますが、匿名利用は共有枠で上限が小さく、混雑しやすくなります。利用量と順番待ちはHugging Face側で決まります。<a href="https://huggingface.co/settings/tokens" target="_blank" rel="noopener">無料トークンの作成</a>・<a href="https://huggingface.co/docs/hub/spaces-zerogpu" target="_blank" rel="noopener">無料枠の説明</a></div>' +
        '<div class="row"><button class="button-secondary" id="aiStudioCheck" type="button">接続確認</button><button class="button" id="aiStudioGenerate" type="button">生成して端末に保存</button><button class="button-secondary" id="aiStudioClose" type="button">閉じる</button></div>' +
        '<div class="ai-studio-status" id="aiStudioStatus" role="status" aria-live="polite">まだ接続していません。接続確認はGPUを使わず、生成を押すと無料枠を消費します。</div><div class="ai-studio-output" id="aiStudioOutput"></div>';
    el.profileModal.hidden = false;
    document.getElementById("aiStudioMode").addEventListener("change",aiStudioUpdateMode);
    document.getElementById("aiStudioCheck").addEventListener("click",aiStudioCheckConnection);
    document.getElementById("aiStudioGenerate").addEventListener("click",aiStudioGenerate);
    document.getElementById("aiStudioClose").addEventListener("click",() => { aiStudioClearPreview(); closeSheet(); });
    aiStudioUpdateMode();
}

function aiStudioUpdateMode(){
    const mode = document.getElementById("aiStudioMode").value;
    const steps = document.getElementById("aiStudioSteps");
    const label = document.getElementById("aiStudioStepsLabel");
    const videoOptions = document.getElementById("aiStudioVideoOptions");
    if(mode === "video"){
        label.textContent = "動画の生成速度";
        steps.innerHTML = '<option value="1">最速（1-step）</option><option value="2">標準（2-step）</option><option value="4">高品質（4-step）</option><option value="8">最高品質（8-step）</option>';
        videoOptions.hidden = false;
    }else{
        label.textContent = "画像の品質";
        steps.innerHTML = '<option value="4">標準（4-step）</option><option value="2">高速（2-step）</option><option value="8">高品質（8-step）</option><option value="1">最速（1-step）</option>';
        videoOptions.hidden = true;
    }
}

async function aiStudioLoadClient(){
    if(!aiStudioClientModule) aiStudioClientModule = import(AI_STUDIO_CLIENT_URL);
    return aiStudioClientModule;
}

async function aiStudioConnect(space,token){
    const {Client} = await aiStudioLoadClient();
    return Client.connect(space,token ? {token} : {});
}

async function aiStudioCheckConnection(){
    const button = document.getElementById("aiStudioCheck");
    const status = document.getElementById("aiStudioStatus");
    const token = document.getElementById("aiStudioToken").value.trim();
    button.disabled = true;
    status.textContent = "画像・動画のAPIに接続しています（生成は行わず、GPU枠も使いません）…";
    try{
        const results = await Promise.all(Object.entries(AI_STUDIO_SPACES).map(async ([kind,space]) => {
            const client = await aiStudioConnect(space,token);
            const info = await client.view_api();
            const endpoint = kind === "image" ? "/infer" : "/generate_image";
            const found = Object.keys(info.named_endpoints || {}).includes(endpoint);
            return (kind === "image" ? "画像" : "動画") + (found ? "API: 接続済み" : "API: 接続先に生成機能がありません");
        }));
        status.textContent = results.join(" / ") + "。生成の成功と利用枠は、生成時に別途確認されます。";
    }catch(error){
        status.textContent = aiStudioErrorText(error);
    }finally{
        button.disabled = false;
    }
}

async function aiStudioGenerate(){
    const button = document.getElementById("aiStudioGenerate");
    const status = document.getElementById("aiStudioStatus");
    const prompt = document.getElementById("aiStudioPrompt").value.trim();
    const mode = document.getElementById("aiStudioMode").value;
    const token = document.getElementById("aiStudioToken").value.trim();
    if(!prompt){ status.textContent = "作りたい内容を入力してください。"; return; }
    if(prompt.length > 500){ status.textContent = "説明文は500文字以内にしてください。"; return; }
    button.disabled = true;
    document.getElementById("aiStudioCheck").disabled = true;
    document.getElementById("aiStudioOutput").replaceChildren();
    aiStudioRevokePreview();
    status.textContent = "Hugging Faceの無料生成キューに送信しています。混雑時は時間がかかり、利用枠不足や提供側の停止で失敗することがあります。";
    try{
        const client = await aiStudioConnect(AI_STUDIO_SPACES[mode],token);
        const values = mode === "image"
            ? [prompt,0,true,512,512,Number(document.getElementById("aiStudioSteps").value)]
            : [prompt,document.getElementById("aiStudioBase").value,document.getElementById("aiStudioMotion").value,Number(document.getElementById("aiStudioSteps").value)];
        const response = await client.predict(mode === "image" ? "/infer" : "/generate_image",values);
        status.textContent = "結果を受け取りました。端末へダウンロードしています…";
        await aiStudioShowAndDownload(response,mode);
        status.textContent = "完了しました。ファイルを端末へダウンロードしました。生成データはAREやSupabaseに保存していません。";
    }catch(error){
        status.textContent = aiStudioErrorText(error);
    }finally{
        button.disabled = false;
        document.getElementById("aiStudioCheck").disabled = false;
    }
}

function aiStudioFindFile(value){
    if(value instanceof Blob) return {blob:value};
    if(!value || typeof value !== "object") return null;
    if(typeof value.url === "string") return {url:value.url};
    if(typeof value.path === "string") return {url:value.path};
    for(const child of Object.values(value)){ const found = aiStudioFindFile(child); if(found) return found; }
    return null;
}

async function aiStudioShowAndDownload(response,mode){
    const file = aiStudioFindFile(response?.data);
    if(!file) throw new Error("生成サービスからファイルが返りませんでした。別の説明文でお試しください。");
    let blob = file.blob;
    if(!blob){
        const url = new URL(file.url,AI_STUDIO_HOSTS[mode]);
        const host = url.hostname;
        if(url.protocol !== "https:" || !(host.endsWith(".hf.space") || host === "huggingface.co" || host.endsWith(".huggingface.co"))) throw new Error("生成ファイルの保存先を確認できませんでした。");
        const download = await fetch(url.href);
        if(!download.ok) throw new Error("生成結果のダウンロードに失敗しました（HTTP " + download.status + "）。");
        blob = await download.blob();
    }
    if(!blob.size) throw new Error("生成ファイルが空でした。もう一度お試しください。");
    const mime = blob.type || (mode === "image" ? "image/png" : "video/mp4");
    if(!blob.type) blob = new Blob([blob],{type:mime});
    aiStudioBlobUrl = URL.createObjectURL(blob);
    const output = document.getElementById("aiStudioOutput");
    const preview = document.createElement(mode === "image" ? "img" : "video");
    preview.src = aiStudioBlobUrl;
    if(mode === "image") preview.alt = "生成した画像";
    else{ preview.controls = true; preview.playsInline = true; }
    const save = document.createElement("a");
    save.className = "button";
    save.href = aiStudioBlobUrl;
    const extension = mime === "image/webp" ? "webp" : mime === "image/jpeg" ? "jpg" : mode === "image" ? "png" : "mp4";
    save.download = "are-ai-" + new Date().toISOString().replace(/[:.]/g,"-") + "." + extension;
    save.textContent = "もう一度ダウンロード";
    output.append(preview,save);
    save.click();
}

function aiStudioErrorText(error){
    const message = String(error?.message || error || "");
    const lower = message.toLowerCase();
    if(lower.includes("quota") || lower.includes("limit") || lower.includes("zerogpu")) return "無料のGPU利用枠が不足しているか、混雑しています。Hugging Face側で枠が戻るまで待つか、接続確認を行ってください。";
    if(lower.includes("runtimeerror") || lower.includes("internal server error")) return "生成サービス内部でエラーが起きました。無料公開モデルの停止・混雑・モデル側の不具合が考えられます。しばらく後に再試行してください。";
    if(lower.includes("401") || lower.includes("403") || lower.includes("unauthorized")) return "アクセストークンを確認してください。公開モデルはトークンなしでも利用できます。トークンを入力する場合はHugging FaceのRead権限を使ってください。";
    if(lower.includes("failed to fetch") || lower.includes("networkerror") || lower.includes("load failed")) return "接続できませんでした。通信状態、Hugging Face側の稼働状況、ブラウザーの拡張機能を確認してください。";
    return "生成に失敗しました。提供側の無料枠・混雑・モデル状態が原因の可能性があります。接続確認を行って時間をおいて再試行してください。";
}

function aiStudioRevokePreview(){
    if(aiStudioBlobUrl){ URL.revokeObjectURL(aiStudioBlobUrl); aiStudioBlobUrl = ""; }
}

function aiStudioClearPreview(){
    aiStudioRevokePreview();
    if(el.profileSheet?.classList.contains("ai-studio-sheet")) el.profileSheet.className = "sheet";
}
