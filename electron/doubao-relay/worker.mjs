import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { collectOriginalImages, imageExtension } from './original-images.mjs';
const require=createRequire(import.meta.url);
const { chromium }=process.env.XUXIA_GPT_RELAY_TEST_DRIVER?await import(pathToFileURL(resolve(process.env.XUXIA_GPT_RELAY_TEST_DRIVER)).href):require('playwright');
const input=JSON.parse(await new Promise((ok,fail)=>{let value='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>value+=x);process.stdin.on('end',()=>ok(value));process.stdin.on('error',fail)}));
const timeout=Number(input.timeout_ms)||35000,validUrl=/^https:\/\/www\.doubao\.com\/chat(?:\/[^?#]*)?(?:[?#].*)?$/;
const output=value=>process.stdout.write(JSON.stringify(value));
if(!validUrl.test(input.session_url||'')){output({status:'ERROR',phase:'before_send',message:'只允许豆包聊天页。'});process.exit(0)}
let browser,phase=input.action==='send'?'before_send':'retrieve';
try{
 browser=await chromium.connectOverCDP(input.debug_endpoint,{timeout});
 const pages=browser.contexts().flatMap(context=>context.pages());let page=null;
 if(input.window_key)for(const candidate of pages){try{if(await candidate.evaluate(key=>window.name===key,input.window_key)){page=candidate;break}}catch{}}
 if(!page)page=pages.find(candidate=>{try{return new URL(candidate.url()).hostname==='www.doubao.com'}catch{return false}})||null;
 const mark=async target=>{if(input.window_key)await target.evaluate(key=>window.name=key,input.window_key)};
 const loginRequired=async target=>{const composer=target.locator('textarea[placeholder*="发消息"],textarea[placeholder*="消息"],[contenteditable="true"],.semi-input-textarea');return !await composer.count()&&/登录|验证码|扫码/.test((await target.locator('body').innerText()).slice(0,1500))};
 if(input.action==='open'){
  if(!page){const context=browser.contexts()[0];page=await context.newPage();await page.goto(input.session_url,{waitUntil:'domcontentloaded',timeout})}
  else if(!validUrl.test(page.url()))await page.goto(input.session_url,{waitUntil:'domcontentloaded',timeout});
  await mark(page);if(!input.background)await page.bringToFront();
  if(await loginRequired(page)){output({status:'ERROR',phase:'before_send',message:'豆包要求登录或验证，请在当前窗口人工完成后重试。'});process.exit(0)}
  output({status:'READY',session_url:page.url(),foreground:true});process.exit(0)
 }
 if(!page){output({status:'ERROR',phase:'before_send',message:'没有找到对应的豆包窗口。'});process.exit(0)}
 await mark(page);if(!input.background)await page.bringToFront();
 if(await loginRequired(page)){output({status:'ERROR',phase:'before_send',message:'豆包要求登录或验证，请在当前窗口人工完成后重试。'});process.exit(0)}
 if(input.action==='send'){
  const editorOverlay=page.locator('[placeholder*="描述图片的用途"],[data-placeholder*="描述图片的用途"]');if(await editorOverlay.count()&&await editorOverlay.last().isVisible()){await page.keyboard.press('Escape');await page.waitForTimeout(500)}
  const findComposer=async()=>{for(const selector of ['.guidance-input-surface .tiptap.ProseMirror','.guidance-input-surface [contenteditable]:not([contenteditable="false"])','.tiptap.ProseMirror','[contenteditable]:not([contenteditable="false"])','.guidance-input-surface textarea:not([disabled])','textarea[placeholder*="发消息"],textarea[placeholder*="消息"],.semi-input-textarea,[role="textbox"]']){const candidates=page.locator(selector);for(let i=await candidates.count()-1;i>=0;i--){if(await candidates.nth(i).isVisible())return candidates.nth(i)}}return null};
  const composerText=target=>target.evaluate(element=>element instanceof HTMLTextAreaElement||element instanceof HTMLInputElement?element.value:(element.innerText||element.textContent||'')).catch(()=> '');
  const fullPrompt=String(input.prompt||'');
  const ensurePrompt=async()=>{const target=await findComposer();if(!target)return false;const current=await composerText(target);if(!current.includes(input.request_id))await target.fill(fullPrompt);const entered=await composerText(target);return entered.includes(input.request_id)};
  const files=Array.isArray(input.image_paths)?input.image_paths:[];let deadline=Date.now()+timeout;
  const inputRoot=page.locator('.guidance-input-surface').last();
  if(files.length){
      // Do not remove existing thumbnails here: Doubao re-renders this area during upload and the old delete click could stall before the product image was uploaded.
   const upload=inputRoot.locator('input[type="file"]').first();if(!await upload.count()){output({status:'ERROR',phase:'before_send',message:'找不到豆包图片上传入口；请在豆包窗口手动处理。'});process.exit(0)}
   await upload.setInputFiles(files);
   const uploadReady=async()=>{let named=true;for(const file of files){const card=inputRoot.getByRole('button',{name:basename(file),exact:true});if(!await card.count()||!await card.last().isVisible()){named=false;break}}if(named)return true;const previews=inputRoot.locator('[role="button"][aria-label^="reference-"]');let visible=0;for(let i=0;i<await previews.count();i++)if(await previews.nth(i).isVisible())visible++;return visible>=files.length};
   while(Date.now()<deadline){if(await uploadReady())break;await page.waitForTimeout(250)}
   if(!await uploadReady()){output({status:'ERROR',phase:'before_send',message:'参考图上传超时，尚未写入提示词或自动发送；请确认模特图和平铺衣服图都出现后重试。'});process.exit(0)}
  }
  deadline=Date.now()+timeout;
  // Fill the prompt only after every reference image is present, so a slow upload cannot leave a half-sent task.
  if(!await ensurePrompt()){output({status:'ERROR',phase:'before_send',message:'参考图上传后提示词无法写入豆包输入框，已停止发送。'});process.exit(0)}  const findSend=async()=>{for(const selector of ['button.bg-dbx-fill-highlight','button[type=submit]','button[aria-label*="发送"]','button[data-testid*="send"]']){const candidates=inputRoot.locator(selector);for(let i=await candidates.count()-1;i>=0;i--)if(await candidates.nth(i).isVisible()&&!await candidates.nth(i).isDisabled())return candidates.nth(i)}const buttons=inputRoot.locator('button:not([disabled])');for(let i=await buttons.count()-1;i>=0;i--)if(await buttons.nth(i).isVisible())return buttons.nth(i);return null};let send=await findSend();while(Date.now()<deadline&&!send){await page.waitForTimeout(200);send=await findSend()}if(!send){output({status:'ERROR',phase:'before_send',message:'豆包发送按钮不可用，请检查登录、验证或生成限额。'});process.exit(0)}
  phase='after_click';await send.click({force:true,timeout:5000});
  const confirmation=page.locator('.list_items .v_list_row').filter({hasText:input.request_id});let confirmed=false;while(Date.now()<deadline&&!confirmed){if(await confirmation.count())confirmed=true;else{const bodyHas=(await page.locator('body').innerText()).includes(input.request_id);const current=await findComposer();const editorHas=current?(await composerText(current)).includes(input.request_id):false;confirmed=bodyHas&&!editorHas}if(!confirmed)await page.waitForTimeout(300)}
  if(!confirmed){output({status:'ERROR',phase:'after_click',message:'已点击豆包发送，但未能确认整套提示词是否进入会话。'});process.exit(0)}
  output({status:'SENT',bound_url:page.url(),request_id:input.request_id,sent_at:new Date().toISOString(),user_message_confirmed:true});process.exit(0)
 }
 if(input.action==='retrieve'){
  const expectedCount=Math.max(1,Number(input.expected_count)||5);
  const rows=page.locator('.list_items .v_list_row'),count=await rows.count();let userIndex=-1;
  for(let i=0;i<count;i++)if((await rows.nth(i).innerText()).includes(input.request_id)){userIndex=i;break}
  if(userIndex<0){output({status:'NOT_FOUND',message:'豆包会话中没有找到本次任务编号。',bound_url:page.url()});process.exit(0)}
  const originals=new Map();
  for(let i=userIndex+1;i<count;i++){
   const row=rows.nth(i),text=(await row.innerText()).trim();if(text.includes('【任务编号：'))break;
   const items=await row.locator('img[src*="/rc_gen_image/"]').evaluateAll(collectOriginalImages);
   for(const item of items)originals.set(item.id,item);
  }
  if(originals.size<expectedCount){output({status:'NOT_READY',message:`本次任务的原始图尚未收齐，目前识别到 ${originals.size}/${expectedCount} 张，将继续检查。`,bound_url:page.url(),count:originals.size});process.exit(0)}
  const downloads=await page.evaluate(async images=>Promise.all(images.map(async item=>{
   try{
    const response=await fetch(item.url,{signal:AbortSignal.timeout(15000)});
    if(!response.ok)return {id:item.id,error:`HTTP ${response.status}`};
    const blob=await response.blob();
    if(blob.size<10240||blob.size>30*1024*1024)return {id:item.id,error:'文件大小异常'};
    const bitmap=await createImageBitmap(blob),width=bitmap.width,height=bitmap.height;bitmap.close();
    if(width<1024||height<1024)return {id:item.id,error:'原图分辨率不足'};
    const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';
    for(let j=0;j<bytes.length;j+=32768)binary+=String.fromCharCode(...bytes.subarray(j,j+32768));
    return {id:item.id,width,height,base64:btoa(binary)};
   }catch{return {id:item.id,error:'下载失败或超时'};}
  })),[...originals.values()].slice(0,expectedCount));
  const failed=downloads.filter(item=>item.error);
  if(failed.length){output({status:'NOT_READY',message:`原始图下载暂未完成（${failed.length} 张失败：${failed[0].error}），将自动重试。`,count:downloads.length-failed.length,bound_url:page.url()});process.exit(0)}
  const validated=downloads.map(item=>{const buffer=Buffer.from(item.base64,'base64');return {...item,buffer,ext:imageExtension(buffer)};});
  mkdirSync(input.output_dir,{recursive:true});const files=[];
  for(const [index,item] of validated.entries()){
   const file=join(input.output_dir,`candidate-${String(index+1).padStart(2,'0')}.${item.ext}`);
   writeFileSync(file,item.buffer);
   files.push({path:file,size_bytes:item.buffer.length,sha256:createHash('sha256').update(item.buffer).digest('hex'),source:'image_ori_raw',image_id:item.id,width:item.width,height:item.height});
  }
  output({status:'RETRIEVED',kind:'IMAGE',source:'image_ori_raw',files,bound_url:page.url(),retrieved_at:new Date().toISOString()});process.exit(0)
 } output({status:'ERROR',phase:'before_send',message:'未知豆包操作。'});
}catch(error){output({status:'ERROR',phase,message:String(error.message||error)})}finally{process.exit(0)}