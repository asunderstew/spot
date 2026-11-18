function readPTX(input){
  "use strict";
  var src=new Uint8Array(input),len=src.length;
  if(len<0x14)throw new Error("too_short");
  var d=new Uint8Array(len);d.set(src.subarray(0,0x14));
  var xt=d[0x12],xv=d[0x13],delta=0,i;
  function gen(mul,neg){for(var k=0;k<256;k++){if(((k*mul)&0xff)===xv)return neg?((-k)&0xff):k;}return 0;}
  if(xt===0x01)delta=gen(53,false);else if(xt===0x05)delta=gen(11,true);else throw new Error("not_session");
  var key=new Uint8Array(256);for(i=0;i<256;i++)key[i]=(i*delta)&0xff;
  for(i=0x14;i<len;i++){var xi=xt===0x01?(i&0xff):((i>>>12)&0xff);d[i]=src[i]^key[xi];}
  var BIG=!!d[0x11];
  function r2(p){return BIG?((d[p]<<8)|d[p+1]):((d[p+1]<<8)|d[p]);}
  function r4(p){return BIG?(((d[p]<<24)>>>0)+(d[p+1]<<16)+(d[p+2]<<8)+d[p+3]):(((d[p+3]<<24)>>>0)+(d[p+2]<<16)+(d[p+1]<<8)+d[p]);}
  function rLE(p,n){var v=0,m=1;for(var k=0;k<n;k++){v+=d[p+k]*m;m*=256;}return v;}
  function str(p){var n=r4(p);if(n>4096||p+4+n>len)return "";var s="";var bytes=d.subarray(p+4,p+4+n);
    try{s=new TextDecoder("utf-8",{fatal:false}).decode(bytes);}catch(e){for(var k=0;k<n;k++)s+=String.fromCharCode(bytes[k]);}return s;}
  function block(pos,max,depth){
    if(pos+9>len||d[pos]!==0x5a||depth>40)return null;
    var bt=r2(pos+1),bs=r4(pos+3),ct=r2(pos+7),off=pos+7;
    if(bs+off>max||(bt&0xff00))return null;
    var b={type:ct,offset:off,size:bs,child:[]},jump=0;
    for(var k=1;k<bs&&pos+k+jump<max;k+=jump?jump:1){
      jump=0;var c=block(pos+k,off+bs,depth+1);
      if(c){b.child.push(c);jump=c.size+7;}
    }
    return b;
  }
  /* version and bit check */
  var ok=d[0]===0x03;
  if(!ok){var bc="0010111100101011";for(i=0;i<0x100&&!ok;i++){var m=true;for(var j=0;j<16;j++){if(d[i+j]!==bc.charCodeAt(j)){m=false;break;}}if(m&&i===1)ok=true;}}
  if(!ok)throw new Error("not_session");
  var blocks=[],p=20;
  while(p<len){var b=block(p,len,0);if(b){blocks.push(b);p+=b.size?b.size+7:1;}else p+=1;}
  var version=0,vb=block(0x1f,len,0);
  if(vb&&vb.type===0x2067)version=2+r4(vb.offset+20);
  else if(vb&&vb.type===0x0003){var skip=str(vb.offset+3).length+8;version=r4(vb.offset+3+skip);}
  else{version=d[0x40]||d[0x3d]||(d[0x3a]+2);}
  var rate=0;blocks.forEach(function(b){if(b.type===0x1028)rate=r4(b.offset+4);});
  if(rate<8000||rate>384000)throw new Error("no_rate");
  function three(j){
    var ob,lb,sb;
    if(BIG){ob=(d[j+4]&0xf0)>>4;lb=(d[j+3]&0xf0)>>4;sb=(d[j+2]&0xf0)>>4;}
    else{ob=(d[j+1]&0xf0)>>4;lb=(d[j+2]&0xf0)>>4;sb=(d[j+3]&0xf0)>>4;}
    function rd(n){return n>=1&&n<=5?rLE(j+5,n):0;}
    var offset=rd(ob);j+=ob;var length=rd(lb);j+=lb;var start=rd(sb);
    return {start:start,offset:offset,length:length};
  }
  var regions=[],ridx=0;
  blocks.forEach(function(b){
    if(b.type!==0x100b&&b.type!==0x262a)return;
    b.child.forEach(function(c){
      if(c.type!==0x1008&&c.type!==0x2629)return;
      var j=c.offset+11,name=str(j);j+=new TextEncoder().encode(name).length+4;
      var t=three(j);regions.push({index:ridx++,name:name,start:t.start,length:t.length});
    });
  });
  var tracks=[];
  blocks.forEach(function(b){
    if(b.type!==0x1015)return;
    b.child.forEach(function(c){
      if(c.type!==0x1014)return;
      var j=c.offset+2,name=str(j);j+=new TextEncoder().encode(name).length+5;
      var nch=r4(j);j+=4;
      for(var k=0;k<nch&&k<8;k++){var ch=r2(j);if(!tracks.some(function(t){return t.index===ch;}))tracks.push({index:ch,name:name});j+=2;}
    });
  });
  function findTrack(ix){for(var k=0;k<tracks.length;k++)if(tracks[k].index===ix)return tracks[k];return null;}
  var out=[];
  blocks.forEach(function(b){
    var count=0;
    if(b.type===0x1012){
      b.child.forEach(function(c){
        if(c.type!==0x1011)return;
        c.child.forEach(function(dd){if(dd.type!==0x100f)return;
          dd.child.forEach(function(e){if(e.type!==0x100e)return;
            var raw=r4(e.offset+4),t=findTrack(count),r=regions[raw];
            if(t&&r)out.push({track:t.name,tindex:t.index,name:r.name,start:r.start,length:r.length});
          });
        });
        count++;
      });
    }else if(b.type===0x1054){
      b.child.forEach(function(c){
        if(c.type!==0x1052)return;
        c.child.forEach(function(dd){
          if(dd.type!==0x1050)return;
          if(d[dd.offset+46]===0x01)return;
          dd.child.forEach(function(e){if(e.type!==0x104f)return;
            var j=e.offset+4,raw=r4(j);j+=5;var start=r4(j);
            var t=findTrack(count),r=regions[raw];
            if(t&&r)out.push({track:t.name,tindex:t.index,name:r.name,start:start,length:r.length});
          });
        });
        count++;
      });
    }
  });
  /* one entry per track name, clip name and position (stereo tracks list each channel) */
  var seen={},clips=[];
  out.forEach(function(o){var k=o.track+"|"+o.name+"|"+o.start;if(seen[k])return;seen[k]=1;clips.push(o);});
  clips.sort(function(a,b){return a.tindex-b.tindex||a.start-b.start;});
  return {version:version,rate:rate,clips:clips,trackCount:tracks.length};
}
