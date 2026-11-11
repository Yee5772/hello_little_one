// Single source of truth for every coordinate in the game (1920x1080 stage pixels).
// Every number below was measured from the artist's PSD layers and verified by pixel-diffing
// a full composite against the Sample_*.png reference renders (mean error ≈ 0).

export const STAGE = { w: 1920, h: 1080 };
export const STATES = ["Default", "Hover", "Active"];

// ---------------------------------------------------------------- menu
export const MENU = {
  bg: { src: "menu/Menu_bg.png", x: 0, y: 0 },
  title: { en: { src: "menu/Menu_Title_EN.png", x: 489, y: 0 }, ch: { src: "menu/Menu_Title_CH.png", x: 364, y: 19 } },
  start: { en: { src: "menu/Button_EN_Start_{s}.png", x: 1244, y: 492 }, ch: { src: "menu/Button_CH_Start_{s}.png", x: 1197, y: 492 } },
  cont: { en: { src: "menu/Button_EN_Continue_{s}.png", x: 1197, y: 653 }, ch: { src: "menu/Button_CH_Continue_{s}.png", x: 1197, y: 658 } },
  // the language icon shows the *other* language (Sample_Menu: English UI shows "CH")
  lang: { en: { src: "menu/Icon_CH_{s}.png", x: 1665, y: 16 }, ch: { src: "menu/Icon_EN_{s}.png", x: 1665, y: 16 } },
  setting: { src: "menu/Icon_Setting_{s}.png", x: 1800, y: 11 },
  exit: { src: "menu/Icon_Exit_{s}.png", x: 13, y: 933 },
  newGame: {
    mask: { src: "menu/Menu_Mask.png", x: 0, y: 0 },
    modal: { en: { src: "menu/Modal_EN_NewGame.png", x: 600, y: 265 }, ch: { src: "menu/Modal_CH_NewGame.png", x: 600, y: 265 } },
    yes: { en: { src: "menu/Button_EN_Yes_{s}.png", x: 707, y: 420 }, ch: { src: "menu/Button_CH_Yes_{s}.png", x: 707, y: 420 } },
    no: { en: { src: "menu/Button_EN_No_{s}.png", x: 1004, y: 420 }, ch: { src: "menu/Button_CH_No_{s}.png", x: 1004, y: 420 } },
    close: { src: "menu/Modal_Close_{s}.png", x: 1291, y: 237 },
  },
};

// ---------------------------------------------------------------- room
// Theme T1 = Bamaogi's pink room (Art/Room/C4), T2 = Yapi's mint room (Art/Room/C3).
const T = (t1, t2) => ({ T1: "room/c4/" + t1, T2: "room/c3/" + (t2 || t1) });
// Bottom -> top, exactly the PSD stacking. `kind` decides the interaction.
export const ROOM_LAYERS = [
  { id: "theme", src: T("Theme_1.png", "Theme_2.png"), x: 0, y: 0, kind: "floor" },
  { id: "rug", src: T("O_Carpet_2.png", "O_Carpet_4.png"), x: 1346, y: 787, kind: "flat" },
  { id: "toy", src: T("O_Toy.png"), x: 1287, y: 952, kind: "toy", furniture: true },
  { id: "curtainNight", src: T("O_Curtain_2.png", "O_Curtain_4.png"), x: 1343, y: 19, kind: "window" },
  { id: "curtainDay", src: T("O_Curtain_1.png", "O_Curtain_3.png"), x: 1343, y: 19, kind: "window" },
  { id: "tent", src: T("O_Tant_1.png", "O_Tant_2.png"), x: 1568, y: 327, kind: "squash" },
  { id: "tentPillowStar", src: T("O_Pillow_5.png", "O_Pillow_9.png"), x: 1715, y: 712, kind: "hop" },
  { id: "tentPillow", src: T("O_Pillow_4.png", "O_Pillow_8.png"), x: 1776, y: 708, kind: "hop" },
  { id: "ball", src: T("O_Ball.png"), x: 1767, y: 932, kind: "ball", furniture: true },
  { id: "mailbox", src: T("O_Mailbox_1.png", "O_Mailbox_2.png"), x: 369, y: 161, kind: "mailbox" },
  { id: "mirror", src: T("O_Mirror_1.png", "O_Mirror_2.png"), x: 78, y: 634, kind: "mirror" },
  { id: "plants", src: T("O_Plants.png"), x: -80, y: 606, kind: "sway" },
  { id: "door", src: T("O_Door_1.png", "O_Door_2.png"), x: 68, y: 28, kind: "door" },
  { id: "doormat", src: T("O_Doormat_1.png", "O_Doormat_2.png"), x: 41, y: 443, kind: "flat", furniture: true },
  { id: "painting", src: T("O_Painting.png"), x: 684, y: 27, kind: "swing", furniture: true },
  { id: "shelf", src: T("O_Shelf_1.png", "O_Shelf_2.png"), x: 899, y: 22, kind: "squash", furniture: true },
  { id: "carpet", src: T("O_Carpet_1.png", "O_Carpet_3.png"), x: 571, y: 526, kind: "flat" },
  { id: "chair", src: T("O_Chair_1.png", "O_Chair_2.png"), x: 603, y: 652, kind: "squash", furniture: true },
  { id: "table", src: T("O_Table_1.png", "O_Table_3.png"), x: 764, y: 498, kind: "squash" },
  { id: "cabinet", src: T("O_Cabinet_1.png", "O_Cabinet_2.png"), x: 1281, y: 312, kind: "squash", furniture: true },
  { id: "stool", src: T("O_Table_2.png", "O_Table_4.png"), x: 1547, y: 506, kind: "squash" },
  { id: "laptop", src: T("O_Laptop.png"), x: 1577, y: 434, kind: "laptop" },
  { id: "lamp", src: T("O_Lamp_1.png", "O_Lamp_2.png"), x: 1297, y: 127, kind: "lamp", rides: "cabinet" },
  { id: "sofa", src: T("O_Sofa_1.png", "O_Sofa_2.png"), x: 684, y: 204, kind: "squash" },
  { id: "doll", src: T("O_Doll.png"), x: 1432, y: 482, kind: "toy", furniture: true },
  { id: "pillowRect", src: T("O_Pillow_3.png"), x: 841, y: 293, kind: "hop" },
  { id: "pillowLeft", src: T("O_Pillow_2.png", "O_Pillow_7.png"), x: 776, y: 273, kind: "hop" },
  { id: "pillowRight", src: T("O_Pillow_1.png", "O_Pillow_6.png"), x: 1059, y: 258, kind: "hop" },
];
// Things that come and go (food served on the table, floor items). Positions from the Room PSD.
export const ROOM_PROPS = {
  soap: { src: "room/c3/O_Soap.png", x: 1223, y: 783, kind: "soap" },
  fish: { src: "room/c3/O_Fish.png", x: 971, y: 485, kind: "food" },
  juice: { src: "room/c3/O_Juice.png", x: 828, y: 411, kind: "food" },
  burger: { src: "room/c3/O_Burger.png", x: 775, y: 533, kind: "food" },
  donut: { src: "room/c3/O_Donut.png", x: 898, y: 534, kind: "food" },
  poop: { src: "room/c3/O_Poop.png", x: 916, y: 870, kind: "poop" },
  coin: { src: "room/c3/O_Coin.png", x: 1075, y: 827, kind: "coin" },
  comb: { src: "room/c3/O_Comb.png", x: 727, y: 834, kind: "comb" },
  shrimp: { src: "room/c3/O_Shrimp.png", x: 1027, y: 539, kind: "food" },
};
export const PROP_ORDER = ["soap", "fish", "juice", "burger", "donut", "poop", "coin", "comb", "shrimp"];
export const FOODS = ["fish", "burger", "donut", "juice", "shrimp"];
// the shop's food cards: three per page (the green sign turns the page); the soap for baths is sold there too
export const SHOP_GOODS = [...FOODS, "soap"];
// things lying on the floor: drawn depth-sorted together with the pet (lower on screen = in front)
export const FLOOR_PROPS = ["poop", "coin", "comb", "soap"];

// Furniture: Bag.psd shows the first six in this order; the shop's furniture bench (Shop.psd)
// sells the cabinet (with its lamp), the toy blocks and the doll — a new room starts without them.
export const FURNITURE_ORDER = ["ball", "doormat", "painting", "shelf", "cabinet", "chair", "toy", "doll"];
export const START_FURNITURE = ["ball", "doormat", "painting", "shelf", "chair"];
// where a thrown ball may roll: its bottom edge stays on the open floor in front of the furniture
export const BALL_FLOOR = { xMin: 330, xMax: 1905, bottomMin: 884, bottomMax: 1074 };

// Where the pet's feet may go (stage px). The round table (O_Table_1/3: 764..1182 x 498..747) and
// the pouf (O_Chair_1/2: 603..781 x 652..787) stand on the floor: the pet walks around them, can be
// behind them (they are drawn over it) and the table top is a place to put the pet on.
// Both only overlap the carpet under them in the PSD, so drawing them depth-sorted with the pet
// keeps the Sample_Room renders exact.
export const NAV = {
  xMin: 478, yBack: 540, yFront: 1030,
  xMaxBack: 1280, xMaxFront: 1141, notchY: 800,       // the toy corner / tent start further right at the back
  obstacles: [
    { id: "table", cx: 973, cy: 712, rx: 236, ry: 44 },   // floor under the table (legs)
    { id: "chair", cx: 692, cy: 768, rx: 138, ry: 26 },   // the pouf's base
  ],
};
export const TABLE = {
  key: 747,                                             // depth: the front legs touch the floor here
  top: { cx: 973, cy: 590, rx: 210, ry: 92 },           // the visible table top
  stand: { cx: 973, cy: 598, rx: 150, ry: 50 },         // where the pet's feet may stand on it
};
export const CHAIR_KEY = 787;
// click-to-walk marker on the floor: the paw from the bag's scrollbar handle, laid flat
export const FLOOR_MARK = { src: "bag/Bag_Handle_Default.png", w: 75, h: 81, sx: 0.78, sy: 0.46 };

export const PETS = {
  C4: {
    folder: "room/c4", frames: "anim/C4_", home: { x: 340, y: 742 }, dressing: { x: 302, y: 772 },
    alpha: { x0: 5, y0: 35, x1: 282, y1: 252 },
    heartIcon: { src: "room/c4/UI_Heart_C4.png", x: 6, y: 0 }, heartFill: "room/c4/UI_Heart_Bar_Pink.png",
    dialog: { dx: 56, dy: -230 }, tail: { dx: 186, dy: 1 },
    headOffsets: { Default: [0, 0], Walking_1: [0, 0], Walking_2: [0, 7], Walking_3: [0, 0], Walking_4: [0, 9], Action_1: [9, -35], Action_2: [4, -34] },
  },
  C3: {
    folder: "room/c3", frames: "anim/C3_", home: { x: 409, y: 755 }, dressing: { x: 280, y: 772 },
    alpha: { x0: 27, y0: 45, x1: 279, y1: 252 },
    heartIcon: { src: "room/c3/UI_Heart_C3.png", x: 19, y: 4 }, heartFill: "room/c3/UI_Heart_Bar_Blue.png",
    dialog: { dx: -58, dy: -274 }, tail: { dx: 72, dy: -43 },
    headOffsets: { Default: [0, 0], Walking_1: [0, 0], Walking_2: [0, 8], Walking_3: [0, 0], Walking_4: [0, 9], Action_1: [9, -35], Action_2: [5, -31] },
  },
};
export const PET_FRAME = { w: 291, h: 252 };
export const FRAME_NAMES = ["Default", "Walking_1", "Walking_2", "Walking_3", "Walking_4", "Action_1", "Action_2"];

export const HUD = {
  track: { src: "{f}/UI_Heart_Bar_Track.png", x: 66, y: 31 },
  fill: { x: 85, y: 47, w: 324, h: 28 },
  coinIcon: { src: "{f}/Icon_Coin.png", x: 434, y: 13 },
  coinDigits: { x: 519, y: 14, advance: 60, scale: 1 },
  badge: { src: "{f}/Mailbox_Notification.png", x: 436, y: 144 },
  badgeDigit: { x: 453, y: 159 },
  setting: { src: "{f}/Icon_Setting_{s}.png", x: 1795, y: 9 },
  bag: { src: "{f}/Icon_Bag_{s}.png", x: 1676, y: 10 },
  shop: { src: "{f}/Icon_Shop_{s}.png", x: 11, y: 944 },
};
export const CHAT = {
  dialog: { src: "{f}/UI_Dialog.png", w: 356, h: 247, text: { l: 30, t: 26, r: 30, b: 34 } },
  tail: { src: "{f}/UI_Dialog_Tail.png", w: 65, h: 58 },
  bar: { src: "{f}/UI_Type_Bar.png", x: 504, y: 967, w: 1018, h: 95, input: { l: 46, t: 14, r: 112, b: 14 } },
  send: { src: "{f}/UI_Type_Send_{s}.png", x: 1427, y: 981 },
};
// Mirror close-up (Dressing.psd: the room smart object is scaled 2.217674x and offset)
export const DRESS_CAMERA = { s: 2.217674, tx: -275.851, ty: -1311.222 };

// ---------------------------------------------------------------- dressing UI
export const DRESSING = {
  modal: { src: "dressing/Modal_Cloth.png", x: 1012, y: 86 },
  cover: { src: "dressing/Modal_Cloth_Cover.png", x: 1012, y: 722 },
  slotCols: [1140, 1338, 1535], slotRows: [176, 361, 548, 736], rowPitch: 187, slotW: 181, slotH: 162,
  slot: "dressing/Slot_Cloth.png", slotSel: "dressing/Slot_Cloth_Selected.png",
  focus: { src: "dressing/Dressing_Focus_Frame.png", dx: -1, dy: -5 },
  track: { src: "dressing/Dressing_Scrollbar_Track.png", x: 1772, y: 179, h: 685 },
  // the handle starts flush with the top of the track (visible paw rows 2..81 of the 97px image)
  handle: { src: "dressing/Scrollbar_Handle_{s}.png", x: 1752, y: 177, h: 97, range: [177, 783] },
  ok: { src: "dressing/Button_OK_{s}.png", x: 1347, y: 936 },
  viewport: { top: 160, bottom: 900 },
  // the two clothing items sit in their slots exactly as in Sample_Dressing
  itemOffsets: { bow: [22, 31], sunglasses: [15, 53] },
};
export const CLOTHES = {
  sunglasses: { src: "shop_dressing/Cloth_SunGlasses.png", w: 147, h: 64, hanger: { x: 918, y: 327 }, price: 36,
    pos: { C4: [32, 97], C3: [32, 97] } },
  bow: { src: "shop_dressing/Cloth_Bow.png", w: 139, h: 104, hanger: { x: 1122, y: 322 }, price: 36,
    pos: { C4: [80, 8], C3: [44, 22] } },
};
export const CLOTH_ORDER = ["bow", "sunglasses"]; // slot order in Sample_Dressing

// ---------------------------------------------------------------- bag
export const BAG = {
  mask: { src: "bag/Bag_Mask.png", x: 0, y: 0 },
  modal: { src: "bag/Bag_Modal.png", x: 362, y: 62 },
  cover: { src: "bag/Bag_Modal_Cover.png", x: 0, y: 0 },
  slotCols: [666, 852, 1034, 1215], slotRows: [222, 391, 560, 734], rowPitch: 171, slotW: 163, slotH: 146,
  slot: "bag/Bag_Slot.png", sel: "bag/Bag_Slot_Selected_{c}.png",
  focus: { src: "bag/Bag_Focus_Frame.png", dx: 0, dy: -3 },
  track: { src: "bag/Bag_Scrollbar_Track.png", x: 1437, y: 229, h: 609 },
  // the handle starts flush with the top of the track (visible paw rows 1..80 of the 81px image)
  handle: { src: "bag/Bag_Handle_{s}.png", x: 1417, y: 228, h: 81, range: [228, 758] },
  ok: { src: "bag/Button_OK_{s}.png", x: 878, y: 932 },
  tabs: [
    { id: "pet", src: "bag/Button_Pet_{s}.png", x: 297, y: 220, sel: "Pet" },
    { id: "theme", src: "bag/Button_Theme_{s}.png", x: 297, y: 333, sel: "Theme" },
    { id: "food", src: "bag/Button_Food_{s}.png", x: 297, y: 447, sel: "Food" },
    { id: "furniture", src: "bag/Button_Furniture_{s}.png", x: 297, y: 562, sel: "Furniture" },
  ],
  viewport: { top: 206, bottom: 905 },
  // furniture thumbnails exactly as placed in Bag.psd (x, y, w, h relative to the slot)
  boxes: {
    ball: [32, 29, 102, 97], doormat: [11, 61, 141.128, 32.39], painting: [18, 27, 126, 92],
    shelf: [10.113, 43, 138.887, 63.187], chair: [19, 29, 126, 95], cabinet: [29.778, 12, 103.222, 124.419],
  },
};

// ---------------------------------------------------------------- settings
export const SETTINGS = {
  mask: { src: "setting/Setting_Mask.png", x: 0, y: 0 },
  modal: { src: "setting/Modal_Setting.png", x: 328, y: 26 },
  sfx: { fill: { src: "setting/Volume_Slider_Fill.png", x: 610, y: 429, w: 320 }, track: { src: "setting/Volume_Slider_Track.png", x: 606, y: 427 },
    handle: { src: "setting/Volume_Slider_Handle_{s}.png", x: 798, y: 390, w: 30 }, icon: { on: "setting/Volume_Icon_On.png", off: "setting/Volume_Icon_Off.png", x: 478, y: 381 } },
  music: { fill: { src: "setting/Music_Slider_Fill.png", x: 610, y: 627, w: 320 }, track: { src: "setting/Music_Slider_Track.png", x: 606, y: 625 },
    handle: { src: "setting/Music_Slider_Handle_{s}.png", x: 798, y: 589, w: 30 }, icon: { on: "setting/Music_Icon_On.png", off: "setting/Music_Icon_Off.png", x: 476, y: 599 } },
  menuBtn: { src: "setting/Button_Menu_{s}.png", x: 1135, y: 536 },
  res: {
    icon: { src: "setting/Resolution_Icon.png", x: 1053, y: 394 },
    field: { src: "setting/Resolution_Field.png", x: 1182, y: 397, w: 287, h: 83 },
    arrow: { src: "setting/Resolution_Arrow.png", x: 1416, y: 426 },
    list: { src: "setting/Resolution_List.png", x: 1184, y: 475 },
    frame: { src: "setting/Resolution_List_Frame.png", x: 1182, y: 465 },
    selected: { src: "setting/Resolution_Selected.png", x: 1185, dy: -9 },
    fieldText: { x: 1213, y: 420, w: 184, h: 41 },
    itemTextY: [494, 560, 623, 693],
  },
  close: { src: "setting/Modal_Close_{s}.png", x: 1500, y: 110 },
  defaultLevel: 0.634375, // handle position in Sample_Setting
};

// ---------------------------------------------------------------- mailbox
export const MAILBOX = {
  mask: { src: "mailbox/Mailbox_Mask.png", x: 0, y: 0 },
  page: { x: 892, y: 828, w: 176, h: 62 },
  modal: { src: "mailbox/Mailbox_Modal.png", x: 437, y: 113 },
  prev: { src: "mailbox/Button_Prev_{s}.png", x: 326, y: 681 },
  next: { src: "mailbox/Button_Next_{s}.png", x: 1519, y: 681 },
  photoBg: { src: "mailbox/Photo_Mask.png", x: 562, y: 225 },
  photo: { src: "mailbox/Photo_Pic_2.png", x: 554, y: 219 },
  frame: { src: "mailbox/Photo_Frame.png", x: 553, y: 216 },
  text: { src: "mailbox/Letter_Text_CH.png", x: 1142, y: 349, box: { x: 1143, y: 350, w: 263, h: 253 } },
  close: { src: "mailbox/Modal_Close_{s}.png", x: 1383, y: 131 },
};

// ---------------------------------------------------------------- shop
export const SHOP = {
  // bottom -> top (Shop.psd); `ui` entries are interactive
  layers: [
    { id: "bg", src: "shop/Bg.png", x: 0, y: 0 },
    { id: "cloth", src: "shop/Button_Cloth_{s}.png", x: 1391, y: 311, ui: true },
    { id: "rope", src: "shop/Rope.png", x: 188, y: 46, kind: "swing" },
    { id: "catPet", src: "shop/Button_Pet_2_{s}.png", x: 152, y: 189, ui: true },
    { id: "catTheme", src: "shop/Button_Theme_2_{s}.png", x: 152, y: 279, ui: true },
    { id: "catFood", src: "shop/Button_Food_2_{s}.png", x: 152, y: 372, ui: true, states: { Default: "shop/Button_Food_2_Defaut.png" } },
    { id: "boardFurniture", src: "shop/Board_Furniture.png", x: 312, y: 540, kind: "swing" },
    { id: "paper1", src: "shop/Slot_Paper_1.png", x: 395, y: 153, kind: "flat" },
    { id: "paper2", src: "shop/Slot_Paper_2.png", x: 693, y: 153, kind: "flat" },
    { id: "paper3", src: "shop/Slot_Paper_3.png", x: 991, y: 149, kind: "flat" },
    { id: "rope2", src: "shop/Rope_2.png", x: 1273, y: 37, kind: "swing" },
    { id: "refresh", src: "shop/Button_Refresh_{s}.png", x: 1240, y: 196, ui: true },
    { id: "signboard", src: "shop/Signboard.png", x: 1405, y: 117, kind: "swing" },
    { id: "flag", src: "shop/Flag.png", x: 1602, y: -36, kind: "sway" },
    { id: "roof", src: "shop/Roof.png", x: 0, y: 0 },
    { id: "plants5", src: "shop/Plants_5.png", x: -47, y: 0, kind: "sway" },
    { id: "doormat", src: "shop/Doormet.png", x: 542, y: 981, kind: "flat" },
    { id: "bench", src: "shop/Bench.png", x: 343, y: 750, kind: "squash" },
    { id: "balloon", src: "shop/Balloon.png", x: -78, y: 433, kind: "sway" },
    { id: "board", src: "shop/Board.png", x: -25, y: 724, kind: "squash" },
    { id: "plants4", src: "shop/Plants_4.png", x: -87, y: 704, kind: "sway" },
    { id: "catSit", src: "shop/Cat_Sit.png", x: 167, y: 839, kind: "squash" },
    { id: "bush", src: "shop/Bush.png", x: 1071, y: 768, kind: "sway" },
    { id: "catBox", src: "shop/Cat_Box.png", x: 1141, y: 842, kind: "squash" },
    { id: "owner", src: "shop/Cat_Shop_Owner.png", x: 1647, y: 461, kind: "squash" },
    { id: "counter", src: "shop/Counter.png", x: 1355, y: 731, kind: "squash" },
    { id: "thanks", src: "shop/Thanks.png", x: 1591, y: 708, kind: "hop" },
    { id: "bell", src: "shop/Bell.png", x: 1513, y: 710, kind: "bell" },
    { id: "plants", src: "shop/Plants.png", x: 1840, y: 662, kind: "sway" },
    { id: "plants2", src: "shop/Plants_2.png", x: 1670, y: 846, kind: "sway" },
    { id: "plants3", src: "shop/Plants_3.png", x: 1287, y: 972, kind: "sway" },
  ],
  bench: [
    { item: "cabinet", src: "room/c3/O_Cabinet_2.png", x: 460, y: 618, tag: { x: 403, y: 766 } },
    { item: "toy", src: "room/c3/O_Toy.png", x: 666, y: 685, tag: { x: 699, y: 766 } },
    { item: "doll", src: "room/c3/O_Doll.png", x: 1061, y: 621, tag: { x: 986, y: 766 } },
  ],
  tag2: { src: "shop/Button_Price2_{s}.png", num: { dx: 70, dy: 15 } },
  cards: [
    { center: [541.5, 296.0], tag: { x: 449, y: 440 } },
    { center: [837.5, 291.0], tag: { x: 752, y: 440 } },
    { center: [1132.5, 293.5], tag: { x: 1050, y: 440 } },
  ],
  tag1: { src: "shop/Button_Price1_{s}.png", num: { dx: 82, dy: 17 } },
  // inside of the coloured frame printed on each Slot_Paper (flood-filled from the paper art):
  // pet / theme pictures are fitted inside it with a margin so they never touch the frame line
  frame: { w: 192, h: 163, centers: [[535.5, 294.0], [834.5, 294.0], [1132.5, 294.0]], fit: { w: 172, h: 140 } },
  priceNum: { Default: "extracted/Price_10_Default.png", Hover: "extracted/Price_10_Default.png", Active: "extracted/Price_10_Active.png" },
  // Shop.psd places the fish mirrored and tilted on its card (smart-object transform)
  fishLinear: [-0.909318, 0.416176, 0.416229, 0.909344],
  mask: { src: "shop/Shop_Mask.png", x: 0, y: 0 },
  coinIcon: { src: "shop/Icon_Coin.png", x: 13, y: 7 },
  coinDigits: { x: 98, y: 8, advance: 60, scale: 1, folder: "shop" },
  back: { src: "shop/Icon_Back_{s}.png", x: 1575, y: 20 },
  bag: { src: "shop/Icon_Bag_{s}.png", x: 1679, y: 7 },
  setting: { src: "shop/Icon_Setting_{s}.png", x: 1798, y: 6 },
  price: 10,
};

// ---------------------------------------------------------------- clothes shop (Shop_Dressing)
export const SHOP_DRESSING = {
  mask: { src: "shop_dressing/Shop_Dressing_Mask.png", x: 0, y: 0 },
  stick: { src: "shop_dressing/Shop_Dressing_Stick.png", x: 844, y: 214 },
  hangers: [{ x: 920, y: 172, item: "sunglasses" }, { x: 1120, y: 172, item: "bow" }],
  hanger: "shop_dressing/Shop_Dressing_Hanger.png",
  priceCoin: { src: "shop_dressing/Price_Coin.png", x: 247, y: 897 },
  // Coin_0..9 digits sized and centred on the ink box of the numbers in Sample_Shop_Dressing
  priceDigits: { x: 357.4, y: 911.7, advance: 35, scale: 0.73, folder: "shop_dressing" },
  coinDigits: { x: 135.5, y: 25.9, advance: 48, scale: 0.8, folder: "shop_dressing" },
  light: { src: "shop_dressing/Shop_Dressing_Light.png", x: 193, y: 0 },
  buy: { src: "shop_dressing/Button_Buy_{s}_{L}.png", x: 513, y: 885 },
  petMatrix: [-1.80889, 0, 0, 1.80889, 805.279, 324.563],
  back: { src: "shop_dressing/Icon_Back_{s}.png", x: 1575, y: 20 },
  coinIcon: { src: "shop_dressing/Icon_Coin.png", x: 24, y: 16 },
  setting: { src: "shop_dressing/Icon_Setting_{s}.png", x: 1798, y: 12 },
  bag: { src: "shop_dressing/Icon_Bag_{s}.png", x: 1679, y: 13 },
  shop: { src: "shop_dressing/Icon_Shop_{s}.png", x: 14, y: 947 },
};

export const RESOLUTIONS = ["1920x1080", "1600x900", "1280x720", "960x540"];
export const DESKTOP_SCALE = 0.6;
