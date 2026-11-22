const Artwork = (() => {
  const width = 720;
  const height = 540;
  const names = ['Indigo', 'Rose', 'Gold', 'Fern', 'Lilac', 'Clay', 'Peach', 'Teal'];
  const palettes = {
    garden: { name: 'Garden inks', colors: ['#414d83','#b65c79','#ddac59','#61846d','#a397ba','#9f5d4c','#edb19c','#428580'] },
    cut: { name: 'Cut Paper', colors: ['#2844a8','#dd4871','#f3c647','#4f8954','#a9a3d9','#bc4434','#f19778','#007f8d'] },
    rhythm: { name: 'Twilight Garden', colors: ['#26294c','#d94a42','#edba41','#68a68a','#8779ab','#ad5641','#f3a36d','#3975a8'] },
    fauve: { name: 'Orchard Brights', colors: ['#49329b','#c84f95','#f3ad3d','#739f43','#8d7ac5','#d95b37','#f5a981','#168780'] },
  };
  for (const [id,name,colors,shades] of [
    ['harbor','Harbor light',['#264958','#df8580','#f0be61','#88916a','#b3adae','#b26348','#efcfaa','#589593'],'Deep sea,Coral,Amber,Sage,Mist,Brick,Apricot,Sea glass'],
    ['alpine','Alpine morning',['#3a535d','#ae7481','#e6ba83','#91a38c','#aaa8b5','#9e7159','#eed7bb','#6c9899'],'Slate,Rose,Ochre,Meadow,Heather,Umber,Cloud,Glacier'],
    ['orchard','Orchard table',['#554a53','#ce8265','#dcb95f','#9caa6d','#adb7ac','#9d735c','#eddbb8','#577d69'],'Plum,Coral,Honey,Pear,Silver sage,Walnut,Linen,Leaf'],
    ['pond','Water garden',['#375d65','#c8808d','#e9bb70','#819c78','#a6b9b5','#987b68','#efd2c7','#639997'],'Deep water,Water lily,Gold,Lily pad,Silver mist,Driftwood,Blush,Pond green'],
  ]) palettes[id]={name,colors,names:shades.split(',')};
  const paintings = {
    ...GlassCollection,
    garden: { name: 'The Moth Garden', collection: 'THE INKED GARDEN', palette: 'garden', ink: '#494053', regions: [], ornaments: [] },
    cut: { name: 'Blue Hour', collection: 'CUT PAPER', palette: 'cut', ink: '#51566c', regions: [], ornaments: [] },
    blank: { name: 'Blank canvas', collection: 'FREEHAND STUDIO', palette: 'garden', regions: [], ornaments: [], blank: true },
  };

  function pathAt(data, x = 0, y = 0, angle = 0, scale = 1) {
    const radians = angle * Math.PI / 180;
    const path = new Path2D();
    path.addPath(new Path2D(data), new DOMMatrix([
      Math.cos(radians)*scale, Math.sin(radians)*scale, -Math.sin(radians)*scale, Math.cos(radians)*scale, x, y,
    ]));
    return path;
  }

  function region(page, data, slot, x, y, angle = 0, scale = 1, labelX = 0, labelY = 0) {
    const r = angle * Math.PI / 180;
    page.regions.push({
      id: page.regions.length, slot, path: pathAt(data, x, y, angle, scale),
      x: x + scale * (labelX * Math.cos(r) - labelY * Math.sin(r)),
      y: y + scale * (labelX * Math.sin(r) + labelY * Math.cos(r)),
    });
  }

  const leaf = 'M0 0 C-9 -22 -7 -45 0 -64 C18 -48 26 -23 0 0 Z';
  const petal = 'M0 -8 C-13 -17 -19 -34 -8 -47 Q0 -55 8 -47 C19 -34 13 -17 0 -8 Z';
  const berry = 'M-8 0 A8 8 0 1 0 8 0 A8 8 0 1 0 -8 0 Z';
  const garden = paintings.garden;

  function branch(x, y, direction, scale, slots) {
    const angles = [-55, 60, -50, 49, -42, 33];
    garden.ornaments.push(pathAt('M0 0 Q-20 -58 0 -158', x, y, direction, scale));
    const r = direction * Math.PI / 180;
    for (let i = 0; i < angles.length; i++) {
      const offsetY = -18 - i * 22;
      const offsetX = -8 + i;
      const leafX = x + scale * (offsetX * Math.cos(r) - offsetY * Math.sin(r));
      const leafY = y + scale * (offsetX * Math.sin(r) + offsetY * Math.cos(r));
      const a = direction + angles[i];
      region(garden, leaf, slots[i % slots.length], leafX, leafY, a, scale * (.9 - .055*i), 4, -31);
      garden.ornaments.push(pathAt('M1 -4 Q9 -20 3 -50', leafX, leafY, a, scale * (.9 - .055*i)));
    }
  }

  [[160,419,-31,.91],[207,439,23,.70],[558,419,28,.91],[518,440,-23,.70],
    [131,317,-37,.85],[584,306,34,.84],[161,182,-55,.69],[563,182,55,.69]]
    .forEach(([x,y,a,s], i) => branch(x,y,a,s,i % 2 ? [3,7,3,4] : [7,3,5,3]));

  function blossom(x, y, scale, turn, slots) {
    for (let i = 0; i < 7; i++) {
      const a = turn + i*360/7;
      region(garden, petal, slots[i % slots.length], x, y, a, scale, 0, -30);
      garden.ornaments.push(pathAt('M0 -9 Q-4 -16 -3 -22',x,y,a,scale));
    }
    region(garden, berry, 2, x, y, 0, 1.35*scale);
  }
  blossom(223,146,1.08,0,[1,1,6,4]);
  blossom(498,150,1.08,25,[4,1,6,4]);
  blossom(312,421,1.14,14,[6,1,6,4]);
  blossom(404,423,1.02,8,[4,6,1,6]);
  blossom(86,341,.54,33,[1,4,6]);
  blossom(634,341,.54,0,[6,1,4]);

  function mothWing(data, slot, flip, x, y, scale, labelX, labelY) {
    const path = new Path2D();
    path.addPath(new Path2D(data), new DOMMatrix([flip*scale,0,0,scale,x,y]));
    garden.regions.push({id:garden.regions.length, slot, path, x:x+flip*scale*labelX, y:y+scale*labelY});
  }
  for (const side of [-1,1]) {
    mothWing('M5 14 C29 -9 68 3 104 31 C87 71 44 91 15 54 Z',4,side,360,264,1,75,54);
    mothWing('M5 6 C28 -47 72 -72 129 -62 C137 -35 106 12 68 18 C39 27 18 22 5 15 Z',0,side,360,264,1,104,-14);
    mothWing('M26 6 C44 -25 83 -56 115 -55 C113 -35 84 -7 53 4 Z',1,side,360,264,1,78,-35);
    mothWing('M24 27 C46 13 73 18 87 35 C73 52 38 66 24 42 Z',6,side,360,264,1,55,33);
    mothWing(berry,2,side,360+side*104,226,.7,0,0);
  }
  region(garden,'M0 -26 C18 -17 14 39 0 68 C-14 39 -18 -17 0 -26 Z',5,360,263,0,1,0,16);
  region(garden,berry,5,360,237);
  garden.ornaments.push(pathAt('M-2 -8 Q-12 -36 -29 -35 M2 -8 Q12 -36 29 -35',360,237));
  for (const [x,y] of [[360,118],[291,89],[429,89],[67,206],[653,206],[360,484],[259,489],[461,489],[274,343],[446,343]]) {
    region(garden,'M0 -10 Q2 -2 9 0 Q2 2 0 10 Q-2 2 -9 0 Q-2 -2 0 -10 Z',2,x,y,0,1.12);
  }

  const cut = paintings.cut;
  const shapes = [
    ['M-76 81 C-119 51 -111 -39 -66 -77 C-21 -113 51 -99 84 -64 C114 -26 113 47 77 78 C43 105 -34 111 -76 81 Z',0,355,255,0,1.14],
    ['M-132 16 C-31 -53 59 -38 131 -17 Q81 37 -6 44 Q-76 47 -132 16 Z',7,360,413,-9,1.16],
    ['M-65 63 C-99 3 -92 -58 -51 -82 C-44 -55 -35 -38 -22 -35 Q-31 -80 2 -107 C25 -78 25 -44 19 -22 Q42 -19 56 -76 Q85 -49 75 -12 Q67 7 44 22 Q70 23 96 1 Q98 49 57 67 Q19 86 -65 63 Z',3,183,326,-15,1.04],
    ['M-59 74 C-87 20 -79 -51 -42 -83 Q-29 -50 -21 -41 Q-16 -87 13 -108 Q40 -81 27 -28 Q52 -39 63 -70 Q96 -36 72 3 Q59 24 34 36 Q65 41 85 20 Q88 66 55 84 Q8 109 -59 74 Z',7,549,305,19,1],
    ['M-51 7 C-65 -16 -44 -54 -13 -44 Q0 -41 8 -22 Q31 -48 55 -34 Q79 -20 60 7 Q74 27 45 43 Q26 56 7 38 Q-20 58 -43 41 Q-66 29 -51 7 Z',1,418,205,-21,.94],
    ['M-52 51 Q-83 29 -70 -16 Q-43 -1 -30 -11 Q-55 -31 -41 -66 Q-13 -65 0 -40 Q10 -73 46 -67 Q60 -35 36 -16 Q68 -13 77 -39 Q102 2 73 32 Q53 57 11 62 Z',5,344,342,-14,.75],
    ['M-12 -40 Q16 -54 38 -30 Q53 -10 39 18 Q26 45 -3 44 Q-36 44 -43 13 Q-50 -18 -12 -40 Z',2,306,158,14,.67],
    ['M-22 -21 L3 -27 L24 -8 L13 23 L-18 25 L-32 5 Z',4,455,96,10,.79],
    ['M-23 5 Q-22 -31 0 -34 Q31 -28 24 3 Q17 35 -23 5 Z',6,154,160,-19,.89],
    ['M0 -26 Q21 -24 23 -1 Q19 19 1 28 Q-24 23 -22 0 Q-19 -19 0 -26 Z',6,563,151,25,.85],
    ['M-38 7 Q-24 -29 12 -23 Q37 -16 37 10 Q15 27 -12 16 Z',1,103,419,-22,.77],
    ['M-32 -11 Q18 -37 46 8 Q18 38 -27 21 Z',2,605,418,19,.78],
    ['M-14 -17 Q18 -20 18 4 Q9 23 -16 16 Q-25 -4 -14 -17 Z',2,397,273,23,1],
    ['M-11 -27 Q17 -17 17 14 Q1 38 -15 19 Q-32 -4 -11 -27 Z',6,250,450,12,.84],
    ['M-15 -23 Q6 -24 15 -5 Q12 23 -14 27 Q-26 -7 -15 -23 Z',4,492,449,21,.9],
    ['M-16 -26 Q24 -15 22 13 Q-5 29 -23 8 Z',4,284,95,-35,.66],
    ['M-17 -20 Q17 -26 20 0 Q16 21 -10 19 Z',2,631,242,12,.75],
  ];
  shapes.forEach(([data,slot,x,y,a,s]) => region(cut,data,slot,x,y,a,s));

  for (const illustration of LineArt) {
    const scale = Math.min((height-24)/illustration.height,(width-24)/illustration.width);
    const drawnWidth = illustration.width*scale;
    const drawnHeight = illustration.height*scale;
    const left = (width-drawnWidth)/2;
    const top = (height-drawnHeight)/2;
    const image = new Image();
    image.src = illustration.ink;
    const regions = illustration.regions.map(([shape,x,y,slot,radius],id)=>{
      // Inscribed radius in page units. A number appears once the zoom makes the shape
      // about 5 units across its narrowest point (tools/number-regions.js keeps shapes
      // big enough that this happens by the 4x zoom limit).
      const room = radius*scale;
      return {
        id, slot, path:pathAt(shape,left,top,0,scale),
        x:left+(x+.5)*scale, y:top+(y+.5)*scale,
        labelSize:Math.max(1.5,Math.min(9,room*1.2)),
        labelZoom:Math.min(4,Math.max(1,4.9/room)),
      };
    });
    paintings[illustration.key] = {
      name:illustration.name,collection:'DETAILED ILLUSTRATIONS',palette:illustration.palette,
      disjoint:true,regions,ornaments:[],raster:{ image,left,top,width:drawnWidth,height:drawnHeight },
      regionsVersion:illustration.version ?? 1, legacy:illustration.legacy,
    };
  }

  function addGenerated(key, style, seed, sequence, version) {
    const { name,collection,palette,regions,ornaments } = Composition.generate(style,seed,version);
    const sheet = { name:`${name} ${sequence}`, collection,palette,ink:'#51566c',regions:[],ornaments:[],generated:true };
    for (const shape of regions) {
      region(sheet,shape.path,shape.slot,shape.x,shape.y,shape.turn,shape.scale,0,shape.labelY ?? 0);
      if (shape.labelSize) sheet.regions.at(-1).labelSize = shape.labelSize;
    }
    sheet.ornaments = ornaments.map(mark=>pathAt(mark.path,mark.x,mark.y,mark.turn,mark.scale));
    paintings[key] = sheet;
    return sheet;
  }

  return { width, height, names, palettes, paintings, addGenerated };
})();
