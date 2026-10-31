const {contextBridge, ipcRenderer} = require('electron');
const pending=[];let receiver;
ipcRenderer.on('native-message',(_event,message)=>{if(receiver)receiver(message);else pending.push(message);});
contextBridge.exposeInMainWorld('desktopBridge',{
  platform:process.platform,
  postMessage:message=>ipcRenderer.send('app-message',message),
  onMessage:callback=>{receiver=callback;for(const message of pending.splice(0))receiver(message);},
});
