"use strict";

let profile3DModule = null;
function loadProfile3D(){ if(!profile3DModule) profile3DModule = import("./chat-profile-3d-scene.js"); return profile3DModule; }
function initProfile3D(){ window.openProfile3D = openProfile3D; window.renderProfile3DCard = renderProfile3DCard; }
async function openProfile3D(){ try{ const module = await loadProfile3D(); await module.open(); }catch(error){ showToast(featError(error)); } }
async function renderProfile3DCard(userId){ try{ const module = await loadProfile3D(); await module.mountProfileCard(userId); }catch(error){ console.warn("3Dプロフィールを表示できませんでした。",error); } }
