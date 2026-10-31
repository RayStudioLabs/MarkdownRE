const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = data => crypto.createHash('sha256').update(data).digest('hex');
function decodeDocument(data) {
  let encoding = 'utf8', bom = false, bytes = data;
  if (data.subarray(0, 3).equals(Buffer.from([239,187,191]))) { bom = true; bytes = data.subarray(3); }
  else if (data.subarray(0,2).equals(Buffer.from([255,254]))) { encoding='utf16le'; bom=true; bytes=data.subarray(2); }
  else if (data.subarray(0,2).equals(Buffer.from([254,255]))) { encoding='utf16be'; bom=true; bytes=data.subarray(2); }
  let raw;
  try { raw = new TextDecoder(encoding === 'utf8' ? 'utf-8' : encoding === 'utf16le' ? 'utf-16le' : 'utf-16be', {fatal:true, ignoreBOM:true}).decode(bytes); }
  catch { throw new Error('无法识别文件编码，文件未打开。支持 UTF-8 和带 BOM 的 UTF-16。'); }
  const endings = new Set(raw.match(/\r\n|\r|\n/g) || []);
  if (endings.size > 1) throw new Error('文件包含混合换行符，暂无法安全编辑。');
  return {text:raw.replace(/\r\n|\r/g,'\n'), encoding, bom, newline:[...endings][0] || '\n', hash:digest(data)};
}
function encodeDocument(text, format) {
  let data=Buffer.from(text.replace(/\r\n|\r/g,'\n').replace(/\n/g,format.newline),format.encoding==='utf8'?'utf8':'utf16le');
  if (format.encoding==='utf16be') data.swap16();
  if (format.bom) data=Buffer.concat([Buffer.from(format.encoding==='utf8'?[239,187,191]:format.encoding==='utf16le'?[255,254]:[254,255]),data]);
  return data;
}
async function fileHash(file) { try {return digest(await fs.readFile(file));} catch(e) {if(e.code==='ENOENT')return null;throw e;} }
async function atomicSave(file, data, expectedHash) {
  if (await fileHash(file)!==expectedHash) throw new Error('文件在保存前再次发生变化，请重试。');
  const temp=path.join(path.dirname(file),`.${path.basename(file)}.${crypto.randomUUID()}.tmp`);
  let handle;
  try {
    const mode=await fs.stat(file).then(s=>s.mode).catch(()=>0o600);
    handle=await fs.open(temp,'wx',mode);await handle.writeFile(data);await handle.sync();await handle.close();handle=null;
    if(await fileHash(file)!==expectedHash)throw new Error('文件已被其他程序修改，未覆盖外部内容。');
    await fs.rename(temp,file);
  } finally {if(handle)await handle.close();await fs.rm(temp,{force:true}).catch(()=>{});}
  return digest(data);
}
async function confinedPath(root, relative) {
  if (!relative || relative.includes('\\') || relative.includes('\0') || path.isAbsolute(relative) || relative.split('/').includes('..')) throw new Error('非法资源路径');
  const base=await fs.realpath(root), resolved=await fs.realpath(path.resolve(base,relative));
  const rel=path.relative(base,resolved);
  if(rel.startsWith('..'+path.sep)||rel==='..'||path.isAbsolute(rel))throw new Error('资源超出文档目录');
  return resolved;
}
module.exports={decodeDocument,encodeDocument,fileHash,atomicSave,confinedPath};
