/**
 * Real astronomy imagery, and honest text about what the eyepiece actually shows.
 *
 * Every entry in images.json was VERIFIED: the NASA image library's own title
 * had to independently name the object. Matching on description text was tried
 * and rejected — it let a "History of Chandra X-Ray Observatory" page pass as a
 * picture of M31, because long historical descriptions mention dozens of
 * objects in passing. Only 13 of 37 candidates survived, and that is the right
 * outcome: an object with no verified image shows NO image.
 *
 * These are telescope and spacecraft photographs, generally long exposures in
 * false colour. They are NOT what you see at the eyepiece, which is why every
 * one is paired with a plain-language expectation.
 */
import imagesJson from './images.json'
import type { TargetKind } from '../domain/targets'
import { getLang } from '../i18n'

export interface AstroImage {
  url: string
  title: string
  credit: string
  license: string
  sourceUrl: string
}

const IMAGES = imagesJson as Record<string, AstroImage>

export function imageFor(targetId: string): AstroImage | null {
  return IMAGES[targetId] ?? null
}

export function imageCount(): number {
  return Object.keys(IMAGES).length
}

/**
 * What Dad will actually see through a 203 mm telescope — which is far less
 * than the photograph, and saying so plainly is more useful than letting the
 * picture set the expectation.
 */
const BY_ID: Record<string, string> = {
  m13: 'A dense ball of stars that resolves into hundreds of pinpoints at higher power. One of the finest sights in this telescope.',
  m31: 'A large bright oval haze. The core is obvious; the spiral arms in photographs are not visible to the eye.',
  m42: 'A bright grey-green glow wrapped around four stars, the Trapezium. Real structure and wisps are visible, though not the colour.',
  m45: 'Brilliant blue-white stars filling the field. Too large for high power — use the widest eyepiece you have.',
  m51: 'Two soft grey patches. Spiral structure needs a dark, moonless night and patience.',
  m57: 'A small, distinct smoke ring. Surprisingly easy to find and unmistakable once you do.',
  m27: 'A fairly bright, chunky rectangle of grey light. One of the better planetary nebulae for this aperture.',
  m81: 'A bright oval core with a faint halo, often sharing the field with M82.',
  m82: 'A thin, mottled streak of light — noticeably irregular compared with M81 beside it.',
  m101: 'A large, very faint round glow. Needs genuinely dark skies; light pollution erases it.',
  m104: 'A small bright oval with a dark dust lane across it, visible on steady nights.',
  m87: 'A featureless round glow. The famous jet is far beyond visual reach.',
  m33: 'A very large, very faint haze. Easier at low power than high, and often harder than its brightness suggests.',
  saturn: 'The rings are clearly separated from the globe, with Cassini division visible on steady nights. Usually the most memorable object in the sky.',
  jupiter: 'Two dark cloud belts, and the four Galilean moons in a line. Their positions change visibly within an hour.',
  mars: 'A small orange disc. Dark surface markings and a polar cap appear near opposition, on steady nights.',
  venus: 'A brilliant featureless crescent or half-disc. Phase is obvious; surface detail is not visible at any aperture.',
  mercury: 'A tiny pale phase, low in twilight. Difficult, and rarely steady.',
  uranus: 'A small blue-green disc, distinguishable from a star mainly by not twinkling.',
  neptune: 'A very small blue-grey dot. Confirming it is a planet rather than a star is the achievement.',
  moon: 'Overwhelmingly bright. Craters along the terminator show the most relief — a full Moon is flat and glaring by comparison.',
  ngc0253: 'A long bright streak, one of the better galaxies for this aperture, though it stays low from New Jersey.',
}

const BY_KIND: Record<TargetKind, string> = {
  globular: 'A round, grainy ball of light that begins resolving into individual stars at higher magnification.',
  'open-cluster': 'A loose scattering of individual stars. Best at low power with a wide field.',
  'emission-nebula': 'A faint grey glow. Colour is not visible to the eye at this aperture; a UHC filter lifts the contrast.',
  'planetary-nebula': 'A small, distinctly non-stellar disc. Higher magnification helps more than it does with most objects.',
  'reflection-nebula': 'A soft haze around a bright star. Subtle, and needs a dark sky.',
  'supernova-remnant': 'A very faint wisp. Among the harder targets, and dependent on genuinely dark conditions.',
  galaxy: 'A faint grey smudge with a brighter middle. Structure rarely shows; averted vision helps.',
  'double-star': 'Two points of light, sometimes with a colour contrast between them.',
  asterism: 'A recognisable pattern of stars rather than a true cluster.',
  planet: 'A small bright disc. Detail depends far more on atmospheric steadiness than on magnification.',
  moon: 'Bright and detailed. The terminator, where sunlight is at a low angle, shows the most.',
}


const BY_ID_ME: Record<string, string> = {
  m13: 'Zbijena lopta zvijezda koja se pri većem uveličanju razlaže na stotine tačkica. Jedan od najljepših prizora u ovom durbinu.',
  m31: 'Veliki svijetli ovalni oblak. Jezgro se jasno vidi; spiralni kraci sa fotografija okom se ne vide.',
  m42: 'Svijetao sivo-zelenkast sjaj oko četiri zvijezde, Trapeza. Vide se stvarne strukture i pramenovi, ali ne i boja.',
  m45: 'Blistave plavo-bijele zvijezde ispunjavaju polje. Prevelik je za veliko uveličanje — uzmi najšire sočivo koje imaš.',
  m51: 'Dvije blage sive mrlje. Za spiralnu strukturu treba tamna noć bez Mjeseca i strpljenje.',
  m57: 'Mali, jasan kolut dima. Iznenađujuće lako se nađe i ne može se zamijeniti ni sa čim.',
  m27: 'Prilično svijetao, zdepast pravougaonik sive svjetlosti. Jedna od boljih planetarnih maglina za ovaj otvor.',
  m81: 'Svijetlo ovalno jezgro sa slabim oreolom, često u istom polju sa M82.',
  m82: 'Tanka, išarana pruga svjetlosti — vidno nepravilna u poređenju sa M81 pored nje.',
  m101: 'Velik, vrlo slab okrugao sjaj. Traži zaista tamno nebo; svjetlosno zagađenje ga briše.',
  m104: 'Mali svijetli oval sa tamnom prašnom trakom preko njega, vidljiv kad je vazduh miran.',
  m87: 'Bezličan okrugao sjaj. Čuveni mlaz je daleko izvan domašaja oka.',
  m33: 'Vrlo velika, vrlo slaba izmaglica. Lakše na malom nego na velikom uveličanju, i često teže nego što joj sjaj nagovještava.',
  saturn: 'Prstenovi su jasno odvojeni od planete, a Kasinijeva pukotina se vidi kad je vazduh miran. Obično najupečatljiviji prizor na nebu.',
  jupiter: 'Dva tamna pojasa oblaka i četiri Galilejeva mjeseca u nizu. Njihov položaj se vidno mijenja i za sat vremena.',
  mars: 'Mali narandžasti disk. Tamne pjege na površini i polarna kapa pojave se blizu opozicije, kad je vazduh miran.',
  venus: 'Blistav srp ili polukrug bez detalja. Faza je očigledna; detalji na površini se ne vide ni na jednom otvoru.',
  mercury: 'Sićušna blijeda faza, nisko u sumraku. Teško, i rijetko mirno.',
  uranus: 'Mali plavo-zelenkast disk, razlikuje se od zvijezde uglavnom po tome što ne treperi.',
  neptune: 'Vrlo mala plavo-siva tačka. Uspjeh je već to što potvrdiš da je planeta, a ne zvijezda.',
  moon: 'Blistavo svijetao. Krateri uz terminator pokazuju najviše reljefa — pun Mjesec je u poređenju ravan i blještav.',
  ngc0253: 'Duga svijetla pruga, jedna od boljih galaksija za ovaj otvor, mada ostaje nisko iz Nju Džersija.',
}

const BY_KIND_ME: Record<TargetKind, string> = {
  globular: 'Okrugla, zrnasta lopta svjetlosti koja se na većem uveličanju počinje razlagati na pojedinačne zvijezde.',
  'open-cluster': 'Rasuta grupa pojedinačnih zvijezda. Najbolje na malom uveličanju sa širokim poljem.',
  'emission-nebula': 'Slab sivi sjaj. Boja se okom ne vidi na ovom otvoru; UHC filter pojačava kontrast.',
  'planetary-nebula': 'Mali disk koji se jasno razlikuje od zvijezde. Veće uveličanje ovdje pomaže više nego kod većine objekata.',
  'reflection-nebula': 'Blaga izmaglica oko svijetle zvijezde. Suptilno, i traži tamno nebo.',
  'supernova-remnant': 'Vrlo slab pramen. Među težim metama, i zavisi od zaista tamnih uslova.',
  galaxy: 'Slaba siva mrlja sa svjetlijom sredinom. Struktura se rijetko vidi; pomaže gledanje postrance.',
  'double-star': 'Dvije tačke svjetlosti, ponekad sa kontrastom u boji.',
  asterism: 'Prepoznatljiv raspored zvijezda, a ne pravo jato.',
  planet: 'Mali svijetli disk. Detalji zavise mnogo više od mirnoće vazduha nego od uveličanja.',
  moon: 'Svijetao i pun detalja. Terminator, gdje sunčeva svjetlost pada pod malim uglom, pokazuje najviše.',
}

/** Never invents a description: falls back to a truthful class-level statement. */
export function visualExpectation(targetId: string, kind: TargetKind): string {
  if (getLang() === 'me') return BY_ID_ME[targetId] ?? BY_KIND_ME[kind]
  return BY_ID[targetId] ?? BY_KIND[kind]
}
