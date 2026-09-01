/**
 * Constellation figures.
 *
 * Every vertex is a real star at its J2000 position — the lines connect actual
 * stars, so the figures sit exactly on the star field rather than being drawn
 * near it. The stick figures themselves are the conventional Western asterisms
 * (the shapes people actually learn), not the IAU boundary polygons, which are
 * administrative regions and useless for finding your way.
 *
 * Coverage is deliberately limited to constellations that are genuinely useful
 * from mid-northern latitudes. Drawing all 88 would be clutter, and most of the
 * southern ones never clear the horizon from New Jersey anyway.
 */

/** name -> [RA hours J2000, Dec degrees J2000] */
export const FIGURE_STARS: Record<string, [number, number]> = {
  // Ursa Major — the Big Dipper, the anchor of the northern sky
  Dubhe: [11.06213, 61.750991],
  Merak: [11.030686, 56.382427],
  Phecda: [11.897179, 53.694758],
  Megrez: [12.257087, 57.032615],
  Alioth: [12.900472, 55.959823],
  Mizar: [13.398761, 54.925362],
  Alkaid: [13.792344, 49.313265],

  // Ursa Minor
  Polaris: [2.52975, 89.264109],
  Kochab: [14.84509, 74.155505],
  Pherkad: [15.345366, 71.834016],
  YildunUMi: [17.536919, 86.586462],
  ZetaUMi: [15.734303, 77.794498],
  EtaUMi: [16.291826, 75.755273],
  EpsilonUMi: [16.766117, 82.037252],

  // Cassiopeia — the W
  Caph: [0.15297, 59.149781],
  Schedar: [0.675122, 56.537331],
  Cih: [0.945142, 60.716745],
  Ruchbah: [1.430216, 60.235283],
  Segin: [1.906566, 63.670101],

  // Orion
  Betelgeuse: [5.919529, 7.407064],
  Bellatrix: [5.418851, 6.349703],
  Mintaka: [5.533445, -0.299092],
  Alnilam: [5.603559, -1.201919],
  Alnitak: [5.679313, -1.942573],
  Saiph: [5.795942, -9.669605],
  Rigel: [5.242298, -8.201638],

  // Cygnus — the Northern Cross
  Deneb: [20.690532, 45.280339],
  Sadr: [20.370472, 40.256679],
  Albireo: [19.512021, 27.959692],
  GienahCyg: [20.770178, 33.970257],
  DeltaCyg: [19.749575, 45.13081],

  // Lyra
  Vega: [18.615649, 38.783689],
  Sheliak: [18.834673, 33.362667],
  Sulafat: [18.98239, 32.689557],
  ZetaLyr: [18.746093, 37.60505],
  DeltaLyr: [18.898295, 36.898613],

  // Aquila
  Altair: [19.846388, 8.868321],
  Tarazed: [19.770994, 10.613261],
  Alshain: [19.921888, 6.406763],

  // Leo
  Regulus: [10.139532, 11.967208],
  Denebola: [11.817661, 14.572058],
  Algieba: [10.332875, 19.841489],
  Zosma: [11.235139, 20.523717],
  Chertan: [11.23727, 15.429585],
  Adhafera: [10.278211, 23.417312],
  Rasalas: [9.879397, 26.007835],
  EtaLeo: [10.122218, 16.762664],

  // Bootes — the kite
  Arcturus: [14.261036, 19.18241],
  Izar: [14.749783, 27.074222],
  Seginus: [14.534617, 38.308247],
  Nekkar: [15.032437, 40.390567],
  Muphrid: [13.91142, 18.397717],
  DeltaBoo: [15.258423, 33.314837],

  // Gemini
  Castor: [7.576634, 31.888276],
  Pollux: [7.755277, 28.026199],
  Alhena: [6.628528, 16.399281],
  Wasat: [7.335387, 21.982316],
  Mebsuta: [6.732128, 25.131128],
  Tejat: [6.382657, 22.513583],
  Alzirr: [6.754815, 12.895592],

  // Taurus
  Aldebaran: [4.598677, 16.509301],
  Elnath: [5.438198, 28.607452],
  ZetaTau: [5.627415, 21.142544],

  // Auriga
  Capella: [5.278155, 45.997991],
  Menkalinan: [5.99216, 44.947433],
  Mahasim: [5.995351, 37.212585],
  Hassaleh: [4.949887, 33.166089],
  Almaaz: [5.032815, 43.823307],

  // Perseus
  Mirfak: [3.40538, 49.861179],
  Algol: [3.136148, 40.955648],
  ZetaPer: [3.9022, 31.883635],
  EpsilonPer: [3.964279, 40.010215],
  DeltaPer: [3.715478, 47.787551],
  GammaPer: [3.079942, 53.506436],

  // Andromeda
  Alpheratz: [0.139791, 29.090431],
  Mirach: [1.162201, 35.620557],
  Almach: [2.064984, 42.329725],
  DeltaAnd: [0.655468, 30.861022],

  // Pegasus — the Great Square
  Markab: [23.079348, 15.205267],
  Scheat: [23.062904, 28.082789],
  Algenib: [0.220597, 15.183594],
  Enif: [21.736433, 9.87501],

  // Canis Major
  Sirius: [6.752478, -16.716116],
  Mirzam: [6.378331, -17.955919],
  Wezen: [7.139857, -26.393201],
  Adhara: [6.977097, -28.972084],
  Aludra: [7.401584, -29.303106],

  // Canis Minor
  Procyon: [7.655033, 5.224993],
  Gomeisa: [7.452522, 8.289317],

  // Scorpius (the head and heart; the tail stays low from New Jersey)
  Antares: [16.490128, -26.432003],
  Graffias: [16.090618, -19.805453],
  Dschubba: [16.005557, -22.62171],
  PiSco: [15.98186, -26.114105],

  // Corona Borealis
  Alphecca: [15.578131, 26.714693],
  ThetaCrB: [15.548118, 31.359233],
  BetaCrB: [15.463754, 29.105699],
  GammaCrB: [15.711572, 26.295601],
  DeltaCrB: [15.82626, 26.068469],
  EpsilonCrB: [15.960476, 26.877905],

  // Draco (head and the bend toward the pole)
  Eltanin: [17.943437, 51.488896],
  Rastaban: [17.507246, 52.301389],
  Altais: [19.209269, 67.661541],
  XiDra: [17.892656, 56.872646],

  // Cepheus
  Alderamin: [21.309661, 62.585574],
  Alfirk: [21.477662, 70.560715],
  Errai: [23.6558, 77.632279],
  ZetaCep: [22.180964, 58.201259],
  IotaCep: [22.828051, 66.200449],

  // Cancer — faint but the gateway to M44
  AcubensCnc: [8.974775, 11.857723],
  AltarfCnc: [8.275254, 9.185544],
  AsellusAus: [8.744751, 18.154309],
  IotaCnc: [8.778866, 28.7603],
}

export interface Constellation {
  /** Latin name, shown as the label. */
  name: string
  /** Common English name, when there is a familiar one. */
  common?: string
  /** Pairs of star keys forming the stick figure. */
  lines: [string, string][]
}

export const CONSTELLATIONS: Constellation[] = [
  {
    name: 'Ursa Major',
    common: 'Big Dipper',
    lines: [
      ['Dubhe', 'Merak'], ['Merak', 'Phecda'], ['Phecda', 'Megrez'],
      ['Megrez', 'Dubhe'], ['Megrez', 'Alioth'], ['Alioth', 'Mizar'],
      ['Mizar', 'Alkaid'],
    ],
  },
  {
    name: 'Ursa Minor',
    common: 'Little Dipper',
    lines: [
      ['Polaris', 'YildunUMi'], ['YildunUMi', 'EpsilonUMi'], ['EpsilonUMi', 'ZetaUMi'],
      ['ZetaUMi', 'Kochab'], ['Kochab', 'Pherkad'], ['Pherkad', 'EtaUMi'],
      ['EtaUMi', 'ZetaUMi'],
    ],
  },
  {
    name: 'Cassiopeia',
    lines: [
      ['Caph', 'Schedar'], ['Schedar', 'Cih'], ['Cih', 'Ruchbah'], ['Ruchbah', 'Segin'],
    ],
  },
  {
    name: 'Orion',
    lines: [
      ['Betelgeuse', 'Bellatrix'],
      ['Bellatrix', 'Mintaka'], ['Mintaka', 'Alnilam'], ['Alnilam', 'Alnitak'],
      ['Alnitak', 'Betelgeuse'],
      ['Mintaka', 'Rigel'], ['Alnitak', 'Saiph'], ['Rigel', 'Saiph'],
    ],
  },
  {
    name: 'Cygnus',
    common: 'Northern Cross',
    lines: [
      ['Deneb', 'Sadr'], ['Sadr', 'Albireo'],
      ['GienahCyg', 'Sadr'], ['Sadr', 'DeltaCyg'],
    ],
  },
  {
    name: 'Lyra',
    lines: [
      ['Vega', 'ZetaLyr'], ['ZetaLyr', 'DeltaLyr'], ['DeltaLyr', 'Sulafat'],
      ['Sulafat', 'Sheliak'], ['Sheliak', 'ZetaLyr'],
    ],
  },
  {
    name: 'Aquila',
    lines: [['Tarazed', 'Altair'], ['Altair', 'Alshain']],
  },
  {
    name: 'Leo',
    lines: [
      ['Regulus', 'EtaLeo'], ['EtaLeo', 'Algieba'], ['Algieba', 'Adhafera'],
      ['Adhafera', 'Rasalas'], ['Regulus', 'Chertan'], ['Chertan', 'Zosma'],
      ['Zosma', 'Denebola'], ['Chertan', 'Denebola'], ['Zosma', 'Algieba'],
    ],
  },
  {
    name: 'Boötes',
    lines: [
      ['Arcturus', 'Muphrid'], ['Arcturus', 'Izar'], ['Izar', 'DeltaBoo'],
      ['DeltaBoo', 'Nekkar'], ['Nekkar', 'Seginus'], ['Seginus', 'Arcturus'],
    ],
  },
  {
    name: 'Gemini',
    lines: [
      ['Castor', 'Mebsuta'], ['Mebsuta', 'Tejat'], ['Castor', 'Pollux'],
      ['Pollux', 'Wasat'], ['Wasat', 'Alhena'], ['Alhena', 'Alzirr'],
      ['Mebsuta', 'Alhena'],
    ],
  },
  {
    name: 'Taurus',
    lines: [['Aldebaran', 'ZetaTau'], ['ZetaTau', 'Elnath'], ['Aldebaran', 'Elnath']],
  },
  {
    name: 'Auriga',
    lines: [
      ['Capella', 'Menkalinan'], ['Menkalinan', 'Mahasim'], ['Mahasim', 'Elnath'],
      ['Elnath', 'Hassaleh'], ['Hassaleh', 'Almaaz'], ['Almaaz', 'Capella'],
    ],
  },
  {
    name: 'Perseus',
    lines: [
      ['Mirfak', 'Algol'], ['Algol', 'ZetaPer'], ['Mirfak', 'DeltaPer'],
      ['DeltaPer', 'EpsilonPer'], ['Mirfak', 'GammaPer'],
    ],
  },
  {
    name: 'Andromeda',
    lines: [['Alpheratz', 'DeltaAnd'], ['DeltaAnd', 'Mirach'], ['Mirach', 'Almach']],
  },
  {
    name: 'Pegasus',
    common: 'Great Square',
    lines: [
      ['Alpheratz', 'Scheat'], ['Scheat', 'Markab'], ['Markab', 'Algenib'],
      ['Algenib', 'Alpheratz'], ['Markab', 'Enif'],
    ],
  },
  {
    name: 'Canis Major',
    lines: [
      ['Mirzam', 'Sirius'], ['Sirius', 'Wezen'], ['Wezen', 'Adhara'],
      ['Adhara', 'Sirius'], ['Wezen', 'Aludra'],
    ],
  },
  {
    name: 'Canis Minor',
    lines: [['Procyon', 'Gomeisa']],
  },
  {
    name: 'Corona Borealis',
    lines: [
      ['ThetaCrB', 'BetaCrB'], ['BetaCrB', 'Alphecca'], ['Alphecca', 'GammaCrB'],
      ['GammaCrB', 'DeltaCrB'], ['DeltaCrB', 'EpsilonCrB'],
    ],
  },
  {
    name: 'Draco',
    lines: [['Rastaban', 'Eltanin'], ['Eltanin', 'XiDra'], ['XiDra', 'Altais']],
  },
  {
    name: 'Cepheus',
    lines: [
      ['Alderamin', 'Alfirk'], ['Alfirk', 'Errai'], ['Errai', 'IotaCep'],
      ['IotaCep', 'ZetaCep'], ['ZetaCep', 'Alderamin'],
    ],
  },
  {
    name: 'Scorpius',
    lines: [
      ['Graffias', 'Dschubba'], ['Dschubba', 'PiSco'], ['Dschubba', 'Antares'],
    ],
  },
  {
    name: 'Cancer',
    lines: [
      ['AltarfCnc', 'AsellusAus'], ['AsellusAus', 'IotaCnc'],
      ['AsellusAus', 'AcubensCnc'],
    ],
  },
]

/** J2000 unit vector for a figure star. */
export function figureStarVector(name: string): [number, number, number] | null {
  const s = FIGURE_STARS[name]
  if (!s) return null
  const ra = (s[0] * 15 * Math.PI) / 180
  const dec = (s[1] * Math.PI) / 180
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)]
}

/** Every star referenced by a figure, so the renderer can guarantee they exist. */
export function allFigureStarNames(): string[] {
  const set = new Set<string>()
  for (const c of CONSTELLATIONS) {
    for (const [a, b] of c.lines) {
      set.add(a)
      set.add(b)
    }
  }
  return [...set]
}
