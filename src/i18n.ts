/**
 * Translations.
 *
 * Every user-facing string goes through t(). Crnogorski uses LATINICA and
 * ijekavian forms — "vrijeme", "gdje", "svijetlo", "prije" — not Serbian
 * ekavian ("vreme", "gde", "svetlo", "pre"). Vocabulary is chosen to sound
 * natural rather than transliterated: "durbin" for the telescope, "sočivo" for
 * the eyepiece.
 *
 * Astronomical object names are deliberately left in their catalogue form
 * (M13, NGC 6205) because that is what the eyepiece boxes, star atlases and
 * every other reference use.
 */
export type Lang = 'en' | 'me'

/** Parameter bag for interpolated strings. */
type P = Record<string, string | number>

export const LANGUAGES: { code: Lang; label: string; flag: string }[] = [
  // The flag is decoration; `label` is what screen readers announce.
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'me', label: 'Crnogorski', flag: '🇲🇪' },
]

const en = {
  'app.title': "Dad's Telescope",
  'hot.title': "What's hot tonight",
  'hot.seeAll': 'See all available',
  'hot.notTonight': (n: number) => `${n} popular targets unavailable tonight`,
  'hot.empty': "Nothing is above the horizon during tonight's dark window.",
  'notTonight.title': 'Not tonight',
  'notTonight.intro':
    "Worth knowing about, but not available during tonight's window. Kept out of the main list rather than shown at 0%.",
  'back.toSky': '↑ Back to sky',
  'detail.best': 'Best',
  'detail.look': 'Look',
  'detail.use': 'Use',
  'detail.filter': 'Filter',
  'detail.expect': 'Expect',
  'detail.noFilter': 'None',
  'detail.score': 'Observability score',
  'detail.why': 'Why this score',
  'detail.minutes': (n: number) => `${n} minutes usable tonight`,
  'detail.up': 'up',
  'detail.noEyepiece': 'No suitable eyepiece',
  'detail.notAProbability':
    'An observability score, not a probability of seeing something.',
  'detail.imageNote': 'Telescope photograph, not the eyepiece view.',
  'detail.distance': 'Distance',
  'detail.lightLeft': 'Light left it',
  'detail.dragRotate': 'Drag to rotate',
  'weather.unavailable': 'Weather unavailable',
  'weather.checking': 'Checking sky…',
  'confidence.high': 'High confidence',
  'confidence.medium': 'Medium confidence',
  'confidence.low': 'Low confidence',
  'menu.title': 'Menu',
  'menu.liveSky': 'Live sky',
  'menu.exploreSky': 'Explore sky',
  'menu.plan': 'Plan observing',
  'menu.imaging': 'Imaging',
  'menu.equipment': 'Equipment',
  'menu.location': 'Location',
  'menu.language': 'Language',
  'menu.sources': 'About & sources',
  'equipment.verified': 'Verified',
  'equipment.unverified': 'Unverified',
  'equipment.on': 'In use',
  'equipment.off': 'Put away',
  'equipment.add': 'Add equipment',
  'equipment.addTitle': 'Add an eyepiece',
  'equipment.brand': 'Brand',
  'equipment.model': 'Model',
  'equipment.focal': 'Focal length (mm)',
  'equipment.save': 'Add',
  'equipment.remove': 'Remove',
  'equipment.unverifiedNote':
    'Unverified equipment is never used in recommendations. Its specifications have not been confirmed, and a wrong figure would produce advice you could not check.',
  'equipment.newIsUnverified':
    'Anything you add starts as unverified, so it will be listed but not recommended.',
  'location.title': 'Location',
  'location.use': 'Use my location',
  'location.home': 'Reset to home — 08330',
  'location.note':
    'Your location is stored only on this device and never sent anywhere. Home is the 08330 ZIP centroid, not a street address.',
  'location.denied': 'Location permission was declined. Keeping the previous location.',
  'plan.title': 'Plan observing',
  'plan.date': 'Date',
  'plan.tonight': 'Tonight',
  'plan.from': 'From',
  'plan.to': 'To',
  'plan.show': 'Show me the sky',
  'plan.reset': 'Back to tonight',
  'plan.window': 'Observing window',
  'plan.noDarkness': 'The Sun never gets fully below the horizon on this date here.',
  'plan.results': (n: number) => `${n} targets in this window`,
  'explore.title': 'Explore sky',
  'explore.live': 'Live',
  'explore.explore': 'Explore',
  'explore.note':
    'Explore mode lets you look anywhere, including below the horizon. Scrub the time to see what rises later.',
  'explore.time': 'Time',
  'explore.scrub': 'drag to move through the night',
  'explore.now': 'tap for now',
  'imaging.title': 'Imaging',
  'imaging.camera': 'Celestron NexImage 10',
  'imaging.intro':
    'A high-frame-rate planetary camera. It suits the Moon and planets, which are bright enough for the short frames that stacking needs.',
  'imaging.suitable': 'Worth imaging',
  'imaging.notSuitable': 'Not suited to this camera',
  'imaging.setup': 'Setup',
  'imaging.native': 'No Barlow (native)',
  'sensor.title': 'Point at sky',
  'sensor.enable': 'Point at sky',
  'sensor.exit': 'Stop pointing',
  'sensor.unsupported': 'This device does not report its orientation.',
  'sensor.denied': 'Motion access was declined. Touch controls still work.',
  'sensor.note': 'Hold the phone up and turn — the view follows.',
  'menu.night': 'Night vision & screen',
  'night.title': 'Night vision & screen',
  'night.red': 'Red screen',
  'night.redWhy':
    'White light bleaches the eye. It takes up to 40 minutes to get your night vision back after a bright screen, so everything turns red and dim while you observe.',
  'night.redLimit':
    'A red screen helps, it does not fix it. A sheet of red film taped over the phone works better, because it covers everything and not just this app.',
  'night.awake': 'Keep screen on',
  'night.awakeWhy': 'So the phone does not lock while both hands are on the telescope.',
  'night.on': 'On',
  'night.off': 'Off',
  'night.unsupported': 'Not on this phone',
  'night.failed': 'Refused by the phone',
  'night.awakeNote':
    'Needs iOS 16.4 or later — and iOS 18.4 if you added this to the Home Screen. It turns itself off whenever you leave the app.',
  'menu.news': 'News',
  'news.title': 'Astronomy news',
  'news.loading': 'Fetching the latest…',
  'news.unavailable': 'News unavailable. Check the connection and try again.',
  'news.retry': 'Try again',
  'news.today': 'Today',
  'news.yesterday': 'Yesterday',
  'news.free': 'Every source here is free to read — no subscription, no sign-up.',
  'news.opens': 'Stories open in your browser.',
  'upcoming.open': 'Best nights this month',
  'upcoming.title': 'The month ahead',
  'upcoming.intro':
    'Positions and timings are exact for the whole month. Weather forecasts only reach about two weeks — nights past that are scored without cloud, and say so.',
  'upcoming.noForecast': 'No forecast yet',
  'upcoming.moon': (n: number) => `Moon ${n}%`,
  'upcoming.cloud': (n: number) => `Cloud ${n}%`,
  'upcoming.usable': (n: number) =>
    n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}m` : `${n} min`,
  'upcoming.empty': 'Nothing clears the horizon in the next month from here.',
  'sun.title': 'The Sun',
  'sun.never': 'Never point the telescope at the Sun.',
  'sun.why':
    'You do not own a solar filter. Through a 203 mm telescope the Sun destroys eyesight instantly and permanently — faster than you can look away. It also melts eyepieces.',
  'sun.shown': 'It is drawn here so you know where it is, and so the sky matches the time of day. It is not a target and never will be.',
  'sun.finder': 'Cap the finder and the Telrad too. Both are telescopes.',
  'sky.clear': 'Clear',
  'sky.broken': 'Broken cloud',
  'sky.mostlyCloudy': 'Mostly cloudy',
  'sky.overcast': 'Overcast',
  'sky.unknown': 'Weather unavailable',
  'sky.worth': (n: number) => `${n} worth trying`,
  'sky.worthNone': 'nothing worth carrying it out for',
  'sky.noCloud': 'scores leave cloud out',
  'guide.sweep': 'Sweep the sky. Tap anything.',
  'guide.left': (n: number) => `LEFT ${n}\u00b0`,
  'guide.right': (n: number) => `RIGHT ${n}\u00b0`,
  'guide.up': (n: number) => `UP ${n}\u00b0`,
  'guide.down': (n: number) => `DOWN ${n}\u00b0`,
  'guide.almost': 'Hold still',
  'guide.centred': 'CENTRED',
  'guide.eyepiece': 'Look through the eyepiece.',
  'guide.away': (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)}\u00b0 to go`,
  'guide.calibrate': 'Compass off. Wave the phone in a figure 8.',
  'guide.coarse': 'Compass is rough — direction is approximate.',
  'sources.title': 'About & sources',
  'sources.figures':
    'Constellation figures are Johan Meuris\u2019s illustrations for Stellarium, used under the Free Art License.',
  'sources.assumptions': 'Our judgement calls',
  'sources.data': 'Data and formulas',
  'sources.note':
    'This app never reports a seeing or transparency measurement, because no free data source provides one. Where a value is our own assumption, it is listed here.',
  'reason.never-rises': 'Never rises from here',
  'reason.below-useful-altitude': 'Too low during your window',
  'reason.too-brief': 'Up too briefly to be worth it',
  'reason.no-dark-overlap': 'No dark sky during your window',
  'reason.below-aperture-limit': 'Too faint for a 203 mm telescope',
  'factor.altitude': 'Peak altitude',
  'factor.duration': 'Time available',
  'factor.magnitude': 'Brightness',
  'factor.surfaceBrightness': 'Surface brightness',
  'factor.cloud': 'Cloud cover',
  'factor.darkness': 'Sky darkness',
  'factor.moon': 'Moonlight',
  'chip.proxy': 'proxy',
  'chip.assumed': 'assumed',
  'notBuilt': 'Not built yet',
  'menu.tonight': 'Tonight at a glance',
  'tonight.moon': 'Moon',
  'tonight.phase': 'Phase',
  'tonight.illum': 'Lit',
  'tonight.age': 'Age',
  'tonight.moonrise': 'Moonrise',
  'tonight.moonset': 'Moonset',
  'tonight.newMoon': 'New',
  'tonight.fullMoon': 'Full',
  'tonight.moonGood': 'The Moon is out of the way — a good night for faint objects.',
  'tonight.moonBad': 'The Moon is up and bright. Favour planets, double stars and clusters.',
  'tonight.darkness': 'Darkness',
  'tonight.sunset': 'Sunset',
  'tonight.civil': 'Civil',
  'tonight.nautical': 'Nautical',
  'tonight.astro': 'Astronomical',
  'tonight.dawn': 'Dawn',
  'tonight.sunrise': 'Sunrise',
  'tonight.darkFor': 'True darkness lasts',
  'tonight.sky': 'Sky',
  'tonight.lst': 'Sidereal time',
  'tonight.cloud': 'Cloud',
  'tonight.humidity': 'Humidity',
  'tonight.temp': 'Temperature',
  'tonight.lstNote': 'An object is highest when its right ascension equals the sidereal time.',
  'tonight.dew.high': 'Dew warning — the air is close to the dew point, so optics will fog.',
  'tonight.dew.moderate': 'Some dew risk later. Keep a dew shield handy.',
  'tonight.dew.low': 'Dew unlikely tonight.',
  'tonight.planets': 'Planets now',
  'tonight.down': 'below horizon',
  'tonight.showers': 'Meteor showers',
  'tonight.zhrNote': 'ZHR is the idealised rate under a perfect dark sky at the zenith. Real counts are always lower.',
  'tonight.eyepieces': 'Your eyepieces',
  // --- Recommendation notes. The domain emits codes + numbers; these render them.
  'note.optics': (p: P) => `${p.mag}× at a ${p.exitPupil} mm exit pupil, ${p.field}′ of true field.`,
  'note.barlow': (p: P) => `The ${p.barlow} multiplies the ${p.focal} mm eyepiece to an effective ${p.effective} mm.`,
  'note.uhcUsed':
    'The UHC passes the oxygen and hydrogen lines this object emits while blocking the rest of the sky glow.',
  'note.noFilterNeeded': 'No filter needed — the sky is dark enough that a UHC would only cost you light.',
  'note.colourOptional': (p: P) => `Optional: the ${p.filter} can lift belt and surface contrast.`,
  'deny.galaxy': 'No filter. Galaxies shine by broadband starlight; a UHC blocks most of it and gains nothing.',
  'deny.openCluster': 'No filter. Star clusters emit continuum light; a UHC only makes them dimmer.',
  'deny.globular': 'No filter. Globular clusters emit continuum light; a UHC costs you the faint outer stars.',
  'deny.reflectionNebula':
    'No filter. Reflection nebulae shine by scattered starlight, not line emission — a UHC does not help.',
  'deny.stars': 'No filter. Stars emit continuum light; a filter only dims them.',
  'deny.planet': 'No filter. Planets shine by reflected sunlight; a UHC destroys brightness and colour.',
  'deny.moon': 'No filter. The Moon shines by reflected sunlight; a UHC is the wrong tool entirely.',
  'warn.largerThanField': (p: P) =>
    `This object spans ${p.size}′ and the field here is ${p.field}′ — you will see part of it, not all of it.`,
  'warn.exitPupilExceedsEye': (p: P) =>
    `The ${p.exitPupil} mm exit pupil is wider than a ${p.eyePupil} mm dark-adapted pupil, so you are effectively using ${p.effective} mm of the ${p.aperture} mm.`,
  'warn.afovUnverified': (p: P) =>
    `Field-of-view figures for the ${p.model} are unconfirmed, so framing advice is approximate.`,
} as const

export type StringKey = keyof typeof en

/**
 * Crnogorski — latinica, ijekavica.
 *
 * Written to read naturally rather than as a literal gloss. Worth a native
 * speaker's eye before it is considered final; nothing here is machine output.
 */
const me: Record<StringKey, unknown> = {
  'app.title': 'Ćaćin durbin',
  'hot.title': 'Šta je najbolje večeras',
  'hot.seeAll': 'Vidi sve dostupno',
  'hot.notTonight': (n: number) => `${n} poznatih objekata nije dostupno večeras`,
  'hot.empty': 'Ništa nije iznad horizonta tokom večerašnjeg mraka.',
  'notTonight.title': 'Ne večeras',
  'notTonight.intro':
    'Vrijedi znati za njih, ali nijesu dostupni u ovom terminu. Držimo ih van glavnog spiska umjesto da ih prikazujemo sa 0%.',
  'back.toSky': '↑ Nazad na nebo',
  'detail.best': 'Najbolje',
  'detail.look': 'Gledaj',
  'detail.use': 'Koristi',
  'detail.filter': 'Filter',
  'detail.expect': 'Očekuj',
  'detail.noFilter': 'Bez filtera',
  'detail.score': 'Ocjena vidljivosti',
  'detail.why': 'Zašto ova ocjena',
  'detail.minutes': (n: number) => `${n} minuta upotrebljivo večeras`,
  'detail.up': 'visine',
  'detail.noEyepiece': 'Nema odgovarajućeg sočiva',
  'detail.notAProbability':
    'Ocjena vidljivosti, a ne vjerovatnoća da ćeš nešto vidjeti.',
  'detail.imageNote': 'Teleskopska fotografija, ne prizor kroz sočivo.',
  'detail.distance': 'Udaljenost',
  'detail.lightLeft': 'Svjetlost je krenula prije',
  'detail.dragRotate': 'Prevuci da zavrtiš',
  'weather.unavailable': 'Vrijeme nedostupno',
  'weather.checking': 'Provjeravam nebo…',
  'confidence.high': 'Visoka pouzdanost',
  'confidence.medium': 'Srednja pouzdanost',
  'confidence.low': 'Niska pouzdanost',
  'menu.title': 'Meni',
  'menu.liveSky': 'Nebo uživo',
  'menu.exploreSky': 'Istraži nebo',
  'menu.plan': 'Planiraj posmatranje',
  'menu.imaging': 'Snimanje',
  'menu.equipment': 'Oprema',
  'menu.location': 'Lokacija',
  'menu.language': 'Jezik',
  'menu.sources': 'O aplikaciji i izvori',
  'equipment.verified': 'Provjereno',
  'equipment.unverified': 'Neprovjereno',
  'equipment.on': 'U upotrebi',
  'equipment.off': 'Sklonjeno',
  'equipment.add': 'Dodaj opremu',
  'equipment.addTitle': 'Dodaj sočivo',
  'equipment.brand': 'Proizvođač',
  'equipment.model': 'Model',
  'equipment.focal': 'Žižna daljina (mm)',
  'equipment.save': 'Dodaj',
  'equipment.remove': 'Ukloni',
  'equipment.unverifiedNote':
    'Neprovjerena oprema se nikad ne koristi u preporukama. Njene specifikacije nijesu potvrđene, a pogrešan podatak bi dao savjet koji ne možeš provjeriti.',
  'equipment.newIsUnverified':
    'Sve što dodaš počinje kao neprovjereno — biće na spisku, ali se neće preporučivati.',
  'location.title': 'Lokacija',
  'location.use': 'Koristi moju lokaciju',
  'location.home': 'Vrati na kuću — 08330',
  'location.note':
    'Tvoja lokacija se čuva samo na ovom uređaju i ne šalje se nigdje. Kuća je centar poštanskog broja 08330, a ne kućna adresa.',
  'location.denied': 'Pristup lokaciji je odbijen. Ostaje prethodna lokacija.',
  'plan.title': 'Planiraj posmatranje',
  'plan.date': 'Datum',
  'plan.tonight': 'Večeras',
  'plan.from': 'Od',
  'plan.to': 'Do',
  'plan.show': 'Pokaži mi nebo',
  'plan.reset': 'Nazad na večeras',
  'plan.window': 'Termin posmatranja',
  'plan.noDarkness': 'Sunce ovdje tog datuma ne zalazi dovoljno duboko.',
  'plan.results': (n: number) => `${n} objekata u ovom terminu`,
  'explore.title': 'Istraži nebo',
  'explore.live': 'Uživo',
  'explore.explore': 'Istraži',
  'explore.note':
    'Režim istraživanja ti dozvoljava da gledaš bilo gdje, i ispod horizonta. Pomjeraj vrijeme da vidiš šta izlazi kasnije.',
  'explore.time': 'Vrijeme',
  'explore.scrub': 'prevuci kroz noć',
  'explore.now': 'dodirni za sada',
  'imaging.title': 'Snimanje',
  'imaging.camera': 'Celestron NexImage 10',
  'imaging.intro':
    'Planetarna kamera sa velikim brojem sličica u sekundi. Odgovara Mjesecu i planetama, koji su dovoljno svijetli za kratke ekspozicije potrebne za slaganje.',
  'imaging.suitable': 'Vrijedi snimati',
  'imaging.notSuitable': 'Ne odgovara ovoj kameri',
  'imaging.setup': 'Postavka',
  'imaging.native': 'Bez Barloua (izvorno)',
  'sensor.title': 'Uperi u nebo',
  'sensor.enable': 'Uperi u nebo',
  'sensor.exit': 'Prekini uperavanje',
  'sensor.unsupported': 'Ovaj uređaj ne javlja svoj položaj.',
  'menu.night': 'Noćni vid i ekran',
  'night.title': 'Noćni vid i ekran',
  'night.red': 'Crveni ekran',
  'night.redWhy':
    'Bijela svjetlost zasljepljuje oko. Poslije svijetlog ekrana treba i do 40 minuta da ti se vid vrati na tamu, pa sve postaje crveno i prigušeno dok posmatraš.',
  'night.redLimit':
    'Crveni ekran pomaže, ali ne rješava sve. Crvena folija zalijepljena preko telefona radi bolje, jer pokriva sve, a ne samo ovu aplikaciju.',
  'night.awake': 'Drži ekran upaljen',
  'night.awakeWhy': 'Da se telefon ne zaključa dok su ti obje ruke na durbinu.',
  'night.on': 'Uključeno',
  'night.off': 'Isključeno',
  'night.unsupported': 'Ne radi na ovom telefonu',
  'night.failed': 'Telefon je odbio',
  'night.awakeNote':
    'Treba iOS 16.4 ili noviji — i iOS 18.4 ako si dodao ovo na početni ekran. Sam se gasi kad izađeš iz aplikacije.',
  'menu.news': 'Vijesti',
  'news.title': 'Astronomske vijesti',
  'news.loading': 'Učitavam najnovije…',
  'news.unavailable': 'Vijesti nisu dostupne. Provjeri vezu pa pokušaj ponovo.',
  'news.retry': 'Pokušaj ponovo',
  'news.today': 'Danas',
  'news.yesterday': 'Juče',
  'news.free': 'Svi izvori su besplatni za čitanje — bez pretplate i bez registracije.',
  'news.opens': 'Vijesti se otvaraju u pregledaču.',
  'upcoming.open': 'Najbolje noći ovog mjeseca',
  'upcoming.title': 'Mjesec pred nama',
  'upcoming.intro':
    'Položaji i vremena su tačni za cijeli mjesec. Prognoza dopire samo oko dvije nedjelje — noći poslije toga ocijenjene su bez oblaka, i to tako piše.',
  'upcoming.noForecast': 'Još nema prognoze',
  'upcoming.moon': (n: number) => `Mjesec ${n}%`,
  'upcoming.cloud': (n: number) => `Oblaci ${n}%`,
  'upcoming.usable': (n: number) =>
    n >= 60 ? `${Math.floor(n / 60)}h ${String(n % 60).padStart(2, '0')}m` : `${n} min`,
  'upcoming.empty': 'Ništa se ne diže iznad horizonta u narednih mjesec dana odavde.',
  'sun.title': 'Sunce',
  'sun.never': 'Nikad ne upiraj durbin u Sunce.',
  'sun.why':
    'Nemaš solarni filter. Kroz durbin od 203 mm Sunce trajno uništi vid u trenu — brže nego što stigneš da skloniš oko. Istopi i sočivo.',
  'sun.shown': 'Ovdje je nacrtano da znaš gdje je i da nebo odgovara dobu dana. Nije meta i neće ni biti.',
  'sun.finder': 'Pokrij i tražilo i Telrad. I oni su durbini.',
  'sky.clear': 'Vedro',
  'sky.broken': 'Isprekidani oblaci',
  'sky.mostlyCloudy': 'Pretežno oblačno',
  'sky.overcast': 'Potpuno oblačno',
  'sky.unknown': 'Nema podataka o vremenu',
  'sky.worth': (n: number) => `${n} vrijedi probati`,
  'sky.worthNone': 'ne vrijedi iznositi durbin',
  'sky.noCloud': 'ocjene ne uključuju oblake',
  'guide.sweep': 'Prelazi po nebu. Dodirni bilo šta.',
  'guide.left': (n: number) => `LIJEVO ${n}\u00b0`,
  'guide.right': (n: number) => `DESNO ${n}\u00b0`,
  'guide.up': (n: number) => `GORE ${n}\u00b0`,
  'guide.down': (n: number) => `DOLJE ${n}\u00b0`,
  'guide.almost': 'Drži mirno',
  'guide.centred': 'U SREDINI',
  'guide.eyepiece': 'Pogledaj kroz sočivo.',
  'guide.away': (n: number) => `još ${n < 10 ? n.toFixed(1) : Math.round(n)}\u00b0`,
  'guide.calibrate': 'Kompas ne radi. Provrti telefon u osmicu.',
  'guide.coarse': 'Kompas je grub — smjer je približan.',
  'sensor.denied': 'Pristup senzorima je odbijen. Kontrole na dodir i dalje rade.',
  'sensor.note': 'Podigni telefon i okreći se — prikaz te prati.',
  'sources.title': 'O aplikaciji i izvori',
  'sources.figures':
    'Likovi sazvije\u017e\u0111a su ilustracije Johana Merisa za Stellarium, kori\u0161\u0107ene pod Free Art licencom.',
  'sources.assumptions': 'Naše procjene',
  'sources.data': 'Podaci i formule',
  'sources.note':
    'Ova aplikacija nikad ne prikazuje izmjereno stanje atmosfere ni prozirnost, jer nijedan besplatan izvor to ne daje. Gdje je vrijednost naša pretpostavka, ovdje je navedena.',
  'reason.never-rises': 'Nikad ne izlazi odavde',
  'reason.below-useful-altitude': 'Prenisko tokom tvog termina',
  'reason.too-brief': 'Prekratko je gore da bi se isplatilo',
  'reason.no-dark-overlap': 'Nema mraka tokom tvog termina',
  'reason.below-aperture-limit': 'Preslabo za durbin od 203 mm',
  'factor.altitude': 'Najveća visina',
  'factor.duration': 'Raspoloživo vrijeme',
  'factor.magnitude': 'Sjaj',
  'factor.surfaceBrightness': 'Površinski sjaj',
  'factor.cloud': 'Oblačnost',
  'factor.darkness': 'Tama neba',
  'factor.moon': 'Mjesečina',
  'chip.proxy': 'posredno',
  'chip.assumed': 'pretpostavka',
  'notBuilt': 'Još nije napravljeno',
  'menu.tonight': 'Večeras ukratko',
  'tonight.moon': 'Mjesec',
  'tonight.phase': 'Mijena',
  'tonight.illum': 'Osvijetljen',
  'tonight.age': 'Starost',
  'tonight.moonrise': 'Izlazak Mjeseca',
  'tonight.moonset': 'Zalazak Mjeseca',
  'tonight.newMoon': 'Mlad',
  'tonight.fullMoon': 'Pun',
  'tonight.moonGood': 'Mjesec ne smeta — dobra noć za slabe objekte.',
  'tonight.moonBad': 'Mjesec je gore i svijetao. Radije planete, dvojne zvijezde i jata.',
  'tonight.darkness': 'Mrak',
  'tonight.sunset': 'Zalazak Sunca',
  'tonight.civil': 'Građanski',
  'tonight.nautical': 'Nautički',
  'tonight.astro': 'Astronomski',
  'tonight.dawn': 'Svitanje',
  'tonight.sunrise': 'Izlazak Sunca',
  'tonight.darkFor': 'Pravi mrak traje',
  'tonight.sky': 'Nebo',
  'tonight.lst': 'Zvjezdano vrijeme',
  'tonight.cloud': 'Oblaci',
  'tonight.humidity': 'Vlažnost',
  'tonight.temp': 'Temperatura',
  'tonight.lstNote': 'Objekat je najviše kad mu rektascenzija bude jednaka zvjezdanom vremenu.',
  'tonight.dew.high': 'Upozorenje na rosu — vazduh je blizu tačke rose, optika će se zamagliti.',
  'tonight.dew.moderate': 'Moguća rosa kasnije. Drži štitnik pri ruci.',
  'tonight.dew.low': 'Rosa večeras nije vjerovatna.',
  'tonight.planets': 'Planete sada',
  'tonight.down': 'ispod horizonta',
  'tonight.showers': 'Meteorski rojevi',
  'tonight.zhrNote': 'ZHR je idealizovana stopa pod savršeno tamnim nebom u zenitu. Stvarni broj je uvijek manji.',
  'tonight.eyepieces': 'Tvoja sočiva',
  'note.optics': (p: P) => `${p.mag}× uz izlaznu zjenicu od ${p.exitPupil} mm, stvarno polje ${p.field}′.`,
  'note.barlow': (p: P) => `${p.barlow} pretvara sočivo od ${p.focal} mm u efektivnih ${p.effective} mm.`,
  'note.uhcUsed':
    'UHC propušta linije kiseonika i vodonika koje ovaj objekat emituje, a blokira ostatak sjaja neba.',
  'note.noFilterNeeded': 'Filter nije potreban — nebo je dovoljno tamno, pa bi UHC samo oduzeo svjetlost.',
  'note.colourOptional': (p: P) => `Opciono: ${p.filter} može pojačati kontrast pojaseva i površine.`,
  'deny.galaxy': 'Bez filtera. Galaksije sijaju širokopojasnom svjetlošću zvijezda; UHC bi je uglavnom blokirao bez ikakve koristi.',
  'deny.openCluster': 'Bez filtera. Zvjezdana jata emituju kontinuiranu svjetlost; UHC bi ih samo zatamnio.',
  'deny.globular': 'Bez filtera. Zbijena jata emituju kontinuiranu svjetlost; UHC bi te koštao slabih spoljnih zvijezda.',
  'deny.reflectionNebula':
    'Bez filtera. Refleksione magline sijaju rasutom svjetlošću zvijezda, a ne linijskom emisijom — UHC tu ne pomaže.',
  'deny.stars': 'Bez filtera. Zvijezde emituju kontinuiranu svjetlost; filter bi ih samo zatamnio.',
  'deny.planet': 'Bez filtera. Planete sijaju odbijenom sunčevom svjetlošću; UHC uništava sjaj i boju.',
  'deny.moon': 'Bez filtera. Mjesec sija odbijenom sunčevom svjetlošću; UHC je ovdje potpuno pogrešan alat.',
  'warn.largerThanField': (p: P) =>
    `Ovaj objekat se prostire ${p.size}′, a polje ovdje je ${p.field}′ — vidjećeš dio, ne cjelinu.`,
  'warn.exitPupilExceedsEye': (p: P) =>
    `Izlazna zjenica od ${p.exitPupil} mm šira je od zjenice oka od ${p.eyePupil} mm, pa efektivno koristiš ${p.effective} mm od ${p.aperture} mm.`,
  'warn.afovUnverified': (p: P) =>
    `Podaci o vidnom polju za ${p.model} nijesu potvrđeni, pa je savjet o kadriranju približan.`,
}

const DICTS: Record<Lang, Partial<Record<StringKey, unknown>>> = { en, me }

/**
 * Exposed so the completeness test can compare the two dictionaries directly
 * rather than parsing this file. The failure it guards against is adding an
 * English string and forgetting the Montenegrin one, which then silently falls
 * back to English in the middle of an otherwise translated screen.
 */
export const __dicts = { en, me } as const

/** Flattens a dictionary to plain text, invoking interpolated strings. */
export function __dictText(lang: Lang): string {
  const d = DICTS[lang]
  return Object.values(d)
    .map((v) => (typeof v === 'function' ? (v as (p: unknown) => string)({}) : String(v)))
    .join(' \n ')
}

let current: Lang = 'en'
const listeners = new Set<() => void>()

export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setLang(l: Lang): void {
  current = l in DICTS ? l : 'en'
  try {
    localStorage.setItem('dt.lang', current)
  } catch {
    /* private mode — language just will not persist */
  }
  listeners.forEach((f) => f())
}

export function getLang(): Lang {
  return current
}

export function loadLang(): void {
  try {
    const s = localStorage.getItem('dt.lang')
    if (s === 'en' || s === 'me') current = s
  } catch {
    /* ignore */
  }
}

/** Falls back to English rather than ever showing a raw key. */
export function t(key: StringKey, arg?: number | P): string {
  const v = (DICTS[current][key] ?? en[key]) as
    | string
    | ((a: never) => string)
  if (typeof v !== 'function') return v
  return (v as (a: unknown) => string)(arg ?? 0)
}

/**
 * Render a structured note from the domain layer.
 *
 * The domain returns { key, params } rather than a sentence, precisely so the
 * astronomy stays language-agnostic and this stays the only place that knows
 * about wording.
 */
export function renderNote(note: { key: string; params?: P }): string {
  return t(note.key as StringKey, note.params)
}
