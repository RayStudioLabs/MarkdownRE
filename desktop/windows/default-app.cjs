async function openDefaultAppSettings({dialog, shell, win, t}) {
  const options={type:'info',message:t('defaultApp'),detail:t('windowsDefaultHint'),buttons:[t('cancel'),t('windowsDefaultOpen')],defaultId:1,cancelId:0};
  const result=await (win?dialog.showMessageBox(win,options):dialog.showMessageBox(options));
  if(result.response!==1)return;
  try { await shell.openExternal('ms-settings:defaultapps'); }
  catch(error) { dialog.showErrorBox(t('windowsDefaultFailed'),error.message||String(error)); }
}
module.exports={openDefaultAppSettings};
