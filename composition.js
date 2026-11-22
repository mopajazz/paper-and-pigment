const Composition = (() => {
  const styles = {
    fernery: { name:'Woodland Fernery', collection:'WOODLAND STUDIES', palette:'garden' },
    medallion: { name:'Botanical Medallion', collection:'ORNAMENTAL GARDENS', palette:'rhythm' },
  };
  const previousStyles = {
    cut:{ name:'Cut Paper', collection:'CUT PAPER', palette:'cut' },
    rhythm:{ name:'Color Rhythms', collection:'GEOMETRIC STUDIES', palette:'rhythm' },
  };
  const organic = [
    'M-63 37 C-83 14 -71 -32 -49 -57 Q-34 -22 -20 -23 Q-26 -60 1 -80 Q29 -55 19 -24 Q45 -28 54 -59 Q82 -32 69 2 Q94 -5 91 13 Q79 56 25 64 Q-22 70 -63 37 Z',
    'M-71 -4 C-67 -41 -36 -64 2 -54 Q43 -68 72 -34 C91 -5 42 -8 44 10 Q48 28 67 26 C72 65 18 69 -8 54 Q-33 76 -53 45 Q-78 35 -71 -4 Z',
    'M-75 38 C-62 9 -74 -14 -40 -44 C-6 -70 40 -57 75 -38 C57 -14 78 13 41 37 C-2 66 -38 58 -75 38 Z',
    'M-55 -2 Q-59 -50 -12 -50 Q9 -46 11 -29 Q37 -57 57 -24 Q74 5 47 17 Q58 45 31 51 Q5 66 -5 40 Q-37 67 -51 34 Q-66 20 -55 -2 Z',
  ];
  const geometric = [
    'M-56 0 A56 56 0 1 0 56 0 A56 56 0 1 0 -56 0 Z',
    'M-66 47 L-12 -65 L61 39 Z',
    'M-61 -24 L47 -43 L62 19 L-46 37 Z',
    'M-60 16 A64 55 0 0 1 60 16 L60 24 L-60 24 Z',
  ];

  function previousComposition(style, seed) {
    const descriptor = previousStyles[style];
    let state = seed >>> 0;
    const random = () => {
      state = (Math.imul(state,1664525)+1013904223) >>> 0;
      return state/4294967296;
    };
    const choose = (items) => items[Math.floor(random()*items.length)];
    const cut = style === 'cut';
    const shapes = cut ? organic : geometric;
    const regions = [];
    const mirror = random()>.5 ? 1 : -1;
    const principal = Math.floor(random()*shapes.length);
    const jitter = (amount) => (random()-.5)*amount;
    function place(path, x, y, scale, slot, turn) {
      regions.push({ path,x:360+(x-360)*mirror,y,scale,slot,turn:turn*mirror });
    }
    place(shapes[principal],335+jitter(36),265+jitter(34),1.32,0,jitter(48));
    const anchors = [[140,171,.83],[490,144,.7],[545,330,.93],[155,369,.82],[350,425,.62],[328,95,.57]];
    anchors.forEach(([x,y,scale],index) => {
      place(shapes[(principal+index+1)%shapes.length],x+jitter(37),y+jitter(36),scale*(.87+random()*.26),[1,2,7,3,5,4][index],jitter(92));
    });
    const accents = [[75,263],[218,252],[576,212],[443,365],[606,424],[242,447],[455,460],[232,84],[583,85]];
    accents.forEach(([x,y],index) => {
      place(choose(shapes),x+jitter(20),y+jitter(22),.14+random()*.19,[6,4,2,1,7,2,6,5,3][index],jitter(152));
    });
    return { ...descriptor,regions,ornaments:[] };
  }
  function restore(item) {
    if (!item || !Number.isInteger(item.seed) || typeof item.key !== 'string' ||
        !/^generated-\d+-\d+$/.test(item.key)) return null;
    const {key,seed} = item;
    if (item.version === 2 && Object.hasOwn(styles,item.style)) {
      return { key,seed,style:item.style,version:2 };
    }
    if (item.version === 1 && Object.hasOwn(previousStyles,item.style)) {
      return { key,seed,style:item.style,version:1 };
    }
    if (item.version !== undefined || typeof item.style !== 'string') return null;
    // The two original, unversioned style keys had distinct lengths.
    const style = {7:'cut',9:'rhythm'}[item.style.length];
    return style ? { key,seed,style,version:1 } : null;
  }

  const petal = 'M0 -6 C-8 -13 -13 -27 -8 -36 C-2 -48 4 -46 9 -36 C14 -27 9 -13 0 -6 Z';
  const blade = 'M0 0 C-13 -12 -10 -26 0 -40 C13 -29 17 -12 0 0 Z';
  const heart = 'M0 0 C-1 -9 -26 -14 -20 -32 C-15 -42 -5 -38 0 -25 C6 -39 18 -43 23 -32 C29 -14 5 -6 0 0 Z';
  const berry = 'M-6 0 A6 6 0 1 0 6 0 A6 6 0 1 0 -6 0 Z';
  const star = 'M0 -12 Q3 -3 10 0 Q3 3 0 12 Q-3 3 -10 0 Q-3 -3 0 -12 Z';

  function generate(style, seed, version = 2) {
    if (version === 1) return previousComposition(style,seed);
    let state = seed >>> 0;
    const random = () => {
      state = (Math.imul(state,1664525)+1013904223) >>> 0;
      return state/4294967296;
    };
    const jitter = amount => (random()-.5)*amount;
    const regions = [];
    const ornaments = [];
    const hueShift = Math.floor(random()*8);
    const region = (path,x,y,scale,turn,slot,labelY = 0,labelSize = 9) => {
      regions.push({ path,x,y,scale,turn,slot:(slot+hueShift)%8,labelY,labelSize });
    };
    const ornament = (path,x = 0,y = 0,scale = 1,turn = 0) => {
      ornaments.push({ path,x,y,scale,turn });
    };
    function flower(x,y,scale,turn,count,slot) {
      for (let index=0;index<count;index++) {
        const angle = turn+360*index/count;
        region(petal,x,y,scale,angle,slot+index%2,-28,scale<.55 ? 7 : 9);
        ornament('M0 -10 Q-3 -18 -1 -26',x,y,scale,angle);
      }
      region(berry,x,y,scale*1.5,0,2,0,8);
      ornament('M-4 -2L-3 -2 M2 -3L3 -3 M-3 3L-2 3 M2 3L3 3',x,y,scale);
    }
    function leaf(x,y,scale,turn,slot,shape = blade) {
      region(shape,x,y,scale,turn,slot,-19,scale<.5 ? 7 : 9);
      ornament('M1 -3 Q7 -14 0 -30 M3 -12 L-4 -16 M3 -18 L8 -23',x,y,scale,turn);
    }
    function fern(x,y,scale,turn,slot) {
      ornament('M0 0 Q-12 -54 4 -112 Q25 -152 47 -139 Q56 -131 49 -124 Q41 -120 38 -127',x,y,scale,turn);
      const radians = turn*Math.PI/180;
      for (let index=0;index<9;index++) {
        const along = -12-Math.floor(index/2)*19-index%2*8;
        const across = -6 + index*.55;
        const dx = (across*Math.cos(radians)-along*Math.sin(radians))*scale;
        const dy = (across*Math.sin(radians)+along*Math.cos(radians))*scale;
        leaf(x+dx,y+dy,scale*(.83-index*.048),turn+(index%2 ? 55 : -50),slot+index%2);
      }
    }
    function polar(radius, angle) {
      const radians = angle*Math.PI/180;
      return [360+Math.cos(radians)*radius,270+Math.sin(radians)*radius];
    }

    if (style === 'medallion') {
      const offset = jitter(28);
      ornament('M360 36 A234 234 0 1 0 360 504 A234 234 0 1 0 360 36 M360 21 A249 249 0 1 0 360 519 A249 249 0 1 0 360 21');
      for (let index=0;index<16;index++) {
        const angle = offset+index*22.5;
        const [x,y] = polar(220,angle);
        leaf(x,y,.92,angle-90,3+index%2,index%4 === 0 ? heart : blade);
        const [seedX,seedY] = polar(218,angle+11.25);
        region(berry,seedX,seedY,1.17,0,2);
      }
      for (let index=0;index<32;index++) {
        const angle = offset+index*11.25;
        const [x,y] = polar(242,angle);
        region(index%2 ? berry : star,x,y,index%2 ? .66 : .52,angle,2+index%3,0,7);
      }
      for (let index=0;index<8;index++) {
        const angle = offset+index*45;
        const [x,y] = polar(143,angle);
        flower(x,y,.70+jitter(.13),angle+26,6+Math.floor(random()*2),index%2 ? 1 : 5);
        const [leafX,leafY] = polar(142,angle+22.5);
        leaf(leafX,leafY,1.15,angle+108,7,heart);
      }
      for (let index=0;index<12;index++) {
        const angle = offset+index*30;
        const [x,y] = polar(61,angle);
        leaf(x,y,.98,angle+90,4+index%2);
      }
      flower(360,270,1.08,offset,8,1);
      for (const x of [54,666]) {
        fern(x,354,.66,x<360 ? -10 : 10,3);
        region(star,x,150,.8,0,2);
      }
    } else {
      ornament('M79 466 C55 354 62 209 133 125 C190 57 268 33 360 33 C452 33 530 57 587 125 C658 209 665 354 641 466');
      ornament('M87 461 C67 350 74 213 143 132 C199 65 275 44 360 44 C445 44 521 65 577 132 C646 213 653 350 633 461');
      const fronds = [
        [106,454,-27,1.12],[158,468,18,1.13],[219,480,47,1.02],
        [614,454,28,1.13],[561,470,-18,1.05],[498,480,-47,1.06],
        [79,310,20,.77],[641,310,-20,.77],[143,207,39,.79],[577,207,-39,.79],
      ];
      for (const [x,y,turn,scale] of fronds) fern(x+jitter(11),y+jitter(8),scale,turn+jitter(10),3);
      for (const [x,y,s] of [[219,136,1.07],[498,137,1.05],[142,307,.72],[582,308,.75],[281,417,.79],[437,416,.78]]) {
        flower(x+jitter(9),y+jitter(9),s,jitter(55),5+Math.floor(random()*3),random()>.5 ? 1 : 5);
      }
      // Broad wings offer an open painting area between the denser botanical motifs.
      for (const side of [-1,1]) {
        const x = 360+side*40;
        const turn = side*55;
        region(heart,x,252,2.12,turn,0,-19,10);
        region(blade,x+side*24,292,1.52,side*127,4,-22,9);
        region(berry,x+side*28,232,1.38,0,2);
      }
      region('M0 -28 C13 -22 12 27 0 50 C-12 27 -13 -22 0 -28 Z',360,269,1,0,5,10,9);
      ornament('M354 243 Q345 214 324 218 M366 243 Q375 214 396 218');
      flower(360,102,.86,jitter(40),8,1);
      for (const [x,y] of [[360,359],[221,244],[499,244],[99,372],[622,372],[360,480],[264,70],[456,70],[189,378],[531,378]]) {
        region(star,x+jitter(8),y+jitter(8),.7+random()*.35,0,2);
      }
    }
    return { ...styles[style],regions,ornaments };
  }

  return { styles,generate,restore };
})();
if (typeof module !== 'undefined') module.exports = Composition;
