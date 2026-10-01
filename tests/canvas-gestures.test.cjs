const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const source=readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const handlers={},captures=new Set();
const target={clientWidth:1000,clientHeight:800,getBoundingClientRect:()=>({left:20,top:40}),
 addEventListener:(type,fn)=>handlers[type]=fn,
 setPointerCapture:id=>captures.add(id),hasPointerCapture:id=>captures.has(id),releasePointerCapture:id=>captures.delete(id),
 classList:{add(){},remove(){}}};
const context=vm.createContext({viewport:target,document:{addEventListener:(type,fn)=>handlers[type]=fn},window:{addEventListener(){}},applyTransform(){},Math});
vm.runInContext('let scale=1,panX=100,panY=80,pointer=null;',context);
vm.runInContext(source.slice(source.indexOf('function zoom('),source.indexOf("$('#zoom-in').onclick")),context);
vm.runInContext(source.slice(source.indexOf('// Canvas navigation:'),source.indexOf("viewport.addEventListener('keydown'")),context);
const run=s=>vm.runInContext(s,context);
const e=(patch={})=>({pointerId:1,pointerType:'mouse',button:0,clientX:100,clientY:100,deltaX:0,deltaY:0,deltaMode:0,ctrlKey:false,metaKey:false,shiftKey:false,target:{closest:()=>null},preventDefault(){this.prevented=true},stopImmediatePropagation(){this.stopped=true},...patch});
// A heading or card drag never invokes selection/default browser behavior.
const down=e();handlers.pointerdown(down);assert(down.prevented);
handlers.pointermove(e({clientX:160,clientY:130}));assert.equal(run('panX'),160);assert.equal(run('panY'),110);
handlers.pointerup(e());const dragClick=e();handlers.click(dragClick);assert(dragClick.prevented&&dragClick.stopped);
// Small tap motion keeps normal card activation.
handlers.pointerdown(e());handlers.pointermove(e({clientX:102}));handlers.pointerup(e());const tap=e();handlers.click(tap);assert(!tap.prevented);
// Ordinary trackpad scroll pans without changing scale.
handlers.wheel(e({deltaX:25,deltaY:40}));assert.equal(run('scale'),1);assert.equal(run('panX'),135);assert.equal(run('panY'),70);
// Zoom keeps the world point under the cursor stationary.
const wx=(200-20-run('panX'))/run('scale'),wy=(250-40-run('panY'))/run('scale');
handlers.wheel(e({ctrlKey:true,deltaY:-30,clientX:200,clientY:250}));
assert(Math.abs((200-20-run('panX'))/run('scale')-wx)<1e-9);
assert(Math.abs((250-40-run('panY'))/run('scale')-wy)<1e-9);
// Two touch points change scale; releasing one continues panning.
const before=run('scale');handlers.pointerdown(e({pointerType:'touch',clientX:100}));handlers.pointerdown(e({pointerType:'touch',pointerId:2,clientX:200}));
handlers.pointermove(e({pointerType:'touch',pointerId:2,clientX:250}));assert(Math.abs(run('scale')-before*1.5)<1e-9);
handlers.pointerup(e({pointerType:'touch',pointerId:2}));const start=run('panX');handlers.pointermove(e({pointerType:'touch',clientX:125}));assert.equal(run('panX'),start+25);handlers.pointerup(e());
// WebKit must receive an uncancelled touch start to synthesize a tap click.
const touchTapDown=e({pointerType:'touch'});handlers.pointerdown(touchTapDown);assert(!touchTapDown.prevented);
handlers.pointerup(e({pointerType:'touch'}));const touchTap=e();handlers.click(touchTap);assert(!touchTap.prevented);
// Movement still claims the touch gesture and suppresses a trailing click.
handlers.pointerdown(e({pointerType:'touch'}));const touchDrag=e({pointerType:'touch',clientX:130});handlers.pointermove(touchDrag);assert(touchDrag.prevented);
handlers.pointerup(e({pointerType:'touch'}));const touchDragClick=e();handlers.click(touchDragClick);assert(touchDragClick.prevented&&touchDragClick.stopped);
// Landing links are not captured as map drags.
const link=e({target:{closest:()=>({tagName:'A'})}});handlers.pointerdown(link);assert(!link.prevented);
const selection=e();handlers.selectstart(selection);assert(selection.prevented);
console.log('Passed: drag suppression, card taps, scroll pan, pointer-anchored zoom, touch pinch, landing links, selection prevention.');
