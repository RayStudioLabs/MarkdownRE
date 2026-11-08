import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {openDefaultAppSettings}=createRequire(import.meta.url)('../desktop/windows/default-app.cjs');

test('Windows default app action opens settings only after confirmation', async () => {
  const opened=[];
  let response=0;
  const dialog={showMessageBox:async()=>({response}),showErrorBox:()=>assert.fail('unexpected error')};
  const shell={openExternal:async url=>opened.push(url)};
  await openDefaultAppSettings({dialog,shell,t:key=>key});
  assert.deepEqual(opened,[]);
  response=1;
  await openDefaultAppSettings({dialog,shell,t:key=>key});
  assert.deepEqual(opened,['ms-settings:defaultapps']);
});

test('Windows default app action reports failure to open system settings', async () => {
  const errors=[];
  const dialog={showMessageBox:async()=>({response:1}),showErrorBox:(...args)=>errors.push(args)};
  const shell={openExternal:async()=>{throw new Error('unavailable');}};
  await openDefaultAppSettings({dialog,shell,win:{},t:key=>key});
  assert.deepEqual(errors,[['windowsDefaultFailed','unavailable']]);
});
