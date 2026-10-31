import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const {decodeDocument,encodeDocument,atomicSave,fileHash,confinedPath}=createRequire(import.meta.url)('../desktop/files.cjs');
for(const encoding of ['utf8','utf16le','utf16be'])for(const newline of ['\n','\r\n','\r'])test(`roundtrip ${encoding} ${JSON.stringify(newline)}`,()=>{
 const format={encoding,newline,bom:true};const bytes=encodeDocument('中文 😀\nsecond\n',format);const decoded=decodeDocument(bytes);
 assert.equal(decoded.text,'中文 😀\nsecond\n');assert.equal(decoded.encoding,encoding);assert.equal(decoded.newline,newline);assert.deepEqual(encodeDocument(decoded.text,decoded),bytes);
});
test('reject malformed text and mixed line endings',()=>{assert.throws(()=>decodeDocument(Buffer.from([0xff,0x01])));assert.throws(()=>decodeDocument(Buffer.from('one\r\ntwo\n')));});
test('atomic save and external-change protection',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'markdownre-save-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));const file=path.join(dir,'note.md');
 const hash=await atomicSave(file,Buffer.from('first'),null);assert.equal(hash,await fileHash(file));
 await fs.writeFile(file,'external');await assert.rejects(atomicSave(file,Buffer.from('lost'),hash));assert.equal(await fs.readFile(file,'utf8'),'external');
 await atomicSave(file,Buffer.from('saved'),await fileHash(file));assert.equal(await fs.readFile(file,'utf8'),'saved');assert.deepEqual(await fs.readdir(dir),['note.md']);
});
test('image paths cannot escape document directory or follow escaping symlinks',async t=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'markdownre-path-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));await fs.mkdir(path.join(dir,'doc'));await fs.writeFile(path.join(dir,'secret'),'secret');await fs.writeFile(path.join(dir,'doc','image.png'),'image');
 assert.equal(await confinedPath(path.join(dir,'doc'),'image.png'),await fs.realpath(path.join(dir,'doc','image.png')));
 for(const name of ['../secret','..\\secret','/etc/passwd'])await assert.rejects(confinedPath(path.join(dir,'doc'),name));
 if(process.platform!=='win32'){await fs.symlink(path.join(dir,'secret'),path.join(dir,'doc','link'));await assert.rejects(confinedPath(path.join(dir,'doc'),'link'));}
});
