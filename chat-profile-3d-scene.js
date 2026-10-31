import * as THREE from "./dream-frontier/vendor/three/build/three.module.js";

const defaultLook = {shape:"round",skin:"#f4c9a5",hair:"#38271e",shirt:"#536dfe",background:"#1f2a44"};
let renderer = null, scene = null, camera = null, actor = null, frame = 0;

function validLook(source){
    const look = Object.assign({},defaultLook,source && typeof source === "object" ? source : {});
    for(const key of ["skin","hair","shirt","background"]) if(!/^#[0-9a-f]{6}$/i.test(look[key])) look[key] = defaultLook[key];
    look.shape = look.shape === "angular" ? "angular" : "round";
    return look;
}

function addPart(parent,geometry,color,position,roughness = .78){
    const mesh = new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color,roughness,metalness:.02}));
    mesh.position.set(...position); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

function buildActor(look){
    const group = new THREE.Group(), angular = look.shape === "angular";
    addPart(group,new THREE.SphereGeometry(angular ? .47 : .5,24,18),look.skin,[0,1.45,0]);
    addPart(group,new THREE.SphereGeometry(.53,24,12,0,Math.PI * 2,0,Math.PI * .48),look.hair,[0,1.58,0]);
    addPart(group,new THREE.CapsuleGeometry(.37,.58,5,14),look.shirt,[0,.72,0]);
    addPart(group,new THREE.CylinderGeometry(.11,.13,.38,10),"#27334a",[-.2,.2,0]);
    addPart(group,new THREE.CylinderGeometry(.11,.13,.38,10),"#27334a",[.2,.2,0]);
    for(const side of [-1,1]){
        addPart(group,new THREE.SphereGeometry(.045,10,8),"#35271e",[side * .17,1.5,.43]);
        addPart(group,new THREE.SphereGeometry(.015,8,6),"#ffffff",[side * .17 - .01,1.52,.463]);
    }
    addPart(group,new THREE.SphereGeometry(.055,8,6),"#d88c7a",[0,1.31,.45]);
    return group;
}

function renderFrame(){
    if(!renderer || !scene || !camera) return;
    if(actor) actor.rotation.y += .004;
    renderer.render(scene,camera);
    frame = requestAnimationFrame(renderFrame);
}

function stopScene(){
    if(frame) cancelAnimationFrame(frame);
    frame = 0;
    if(renderer) renderer.dispose();
    renderer = null; scene = null; camera = null; actor = null;
}

function drawScene(canvas,look){
    stopScene();
    const width = Math.max(1,canvas.clientWidth || 320), height = Math.max(1,canvas.clientHeight || 220);
    scene = new THREE.Scene(); scene.background = new THREE.Color(look.background); scene.fog = new THREE.Fog(look.background,6,12);
    camera = new THREE.PerspectiveCamera(34,width / height,.1,30); camera.position.set(0,1.5,6.4); camera.lookAt(0,1,0);
    renderer = new THREE.WebGLRenderer({canvas,antialias:true,alpha:false,powerPreference:"high-performance"});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2)); renderer.setSize(width,height,false); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene.add(new THREE.HemisphereLight(0xfff3da,0x536078,2));
    const sun = new THREE.DirectionalLight(0xffffff,3); sun.position.set(-3,5,5); sun.castShadow = true; sun.shadow.mapSize.set(1024,1024); scene.add(sun);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(2,48),new THREE.MeshStandardMaterial({color:"#d3c5a5",roughness:.94})); floor.rotation.x = -Math.PI/2; floor.position.y = -.03; floor.receiveShadow = true; scene.add(floor);
    actor = buildActor(look); scene.add(actor); renderFrame();
}

async function getLook(userId){
    const result = await window.requireClient().from("profile_3d_looks").select("look").eq("user_id",userId).maybeSingle();
    if(result.error) throw result.error;
    return validLook(result.data?.look);
}

function colorInput(id,label,value){ return '<label class="p3d-color"><span>' + label + '</span><input id="' + id + '" type="color" value="' + value + '"></label>'; }

export async function open(){
    const userId = window.AREHooks.me().id;
    const look = await getLook(userId);
    window.openSheet('<div class="profile3d-sheet"><h3>🧊 3Dプロフィールカード</h3><div class="meta">見た目の設定だけを保存します。動きの同期や追加通信はありません。</div><canvas id="profile3dCanvas" class="profile3d-canvas"></canvas><label>形<select id="p3dShape"><option value="round"' + (look.shape === "round" ? " selected" : "") + '>丸い</option><option value="angular"' + (look.shape === "angular" ? " selected" : "") + '>少し角ばった</option></select></label><div class="p3d-colors">' + colorInput("p3dSkin","肌",look.skin) + colorInput("p3dHair","髪",look.hair) + colorInput("p3dShirt","服",look.shirt) + colorInput("p3dBackground","背景",look.background) + '</div><div class="row"><button type="button" class="button-secondary" data-pm="close">閉じる</button><button type="button" class="button" id="p3dSave">保存</button></div></div>');
    const canvas = document.getElementById("profile3dCanvas");
    const readLook = () => validLook({shape:document.getElementById("p3dShape").value,skin:document.getElementById("p3dSkin").value,hair:document.getElementById("p3dHair").value,shirt:document.getElementById("p3dShirt").value,background:document.getElementById("p3dBackground").value});
    drawScene(canvas,look);
    ["p3dShape","p3dSkin","p3dHair","p3dShirt","p3dBackground"].forEach((id) => document.getElementById(id).addEventListener("input",() => drawScene(canvas,readLook())));
    document.getElementById("p3dSave").addEventListener("click",async (event) => {
        const button = event.currentTarget; button.disabled = true;
        try{ const result = await window.requireClient().from("profile_3d_looks").upsert({user_id:userId,look:readLook()},{onConflict:"user_id"}); if(result.error) throw result.error; window.showToast("3Dプロフィールカードを保存しました。"); }
        catch(error){ window.showToast(window.featError(error)); }
        finally{ button.disabled = false; }
    });
}

export async function mountProfileCard(userId){
    const target = document.getElementById("profile3dPreview");
    if(!target) return;
    const result = await window.requireClient().from("profile_3d_looks").select("look").eq("user_id",userId).maybeSingle();
    if(result.error || !result.data?.look) return;
    target.hidden = false;
    const canvas = target.querySelector("canvas");
    drawScene(canvas,validLook(result.data.look));
}

window.stopProfile3D = stopScene;
