/**
 * Catálogo de modelos conocidos para SUGERIR al escribir. No es lo que se vende: es lo que la gente busca por
 * nombre de modelo (celulares, pantallas, consolas, laptops, electrodomésticos, audio) y las variantes que cambian
 * el precio (capacidad, tamaño, edición). Con esto el usuario compara un modelo EXACTO entre tiendas en vez de un
 * término vago. Lo que la gente busca de verdad se aprende en la base de datos y se suma a esto (ver suggest.ts).
 */

export type ModelCategory =
  | 'celular'
  | 'pantalla'
  | 'consola'
  | 'laptop'
  | 'tableta'
  | 'audio'
  | 'reloj'
  | 'hogar'
  | 'computo'
  | 'foto';

export interface KnownModel {
  brand: string;
  /** Nombre base del modelo tal como se escribe ("iPhone 15 Pro"). */
  model: string;
  /** Variantes que cambian el producto (capacidad, pulgadas, edición). */
  variants: string[];
  category: ModelCategory;
}

const M = (brand: string, model: string, category: ModelCategory, variants: string[] = []): KnownModel => ({
  brand,
  model,
  category,
  variants,
});

const PHONE = ['128GB', '256GB', '512GB'];
const PRO = ['256GB', '512GB', '1TB'];
const TV = ['43 pulgadas', '50 pulgadas', '55 pulgadas', '65 pulgadas', '75 pulgadas'];
const TV_BIG = ['55 pulgadas', '65 pulgadas', '75 pulgadas'];

export const KNOWN_MODELS: readonly KnownModel[] = [
  // Celulares
  M('Apple', 'iPhone 17 Pro Max', 'celular', PRO),
  M('Apple', 'iPhone 17 Pro', 'celular', PRO),
  M('Apple', 'iPhone 17', 'celular', ['256GB', '512GB']),
  M('Apple', 'iPhone Air', 'celular', ['256GB', '512GB']),
  M('Apple', 'iPhone 16 Pro Max', 'celular', PRO),
  M('Apple', 'iPhone 16 Pro', 'celular', ['128GB', ...PRO]),
  M('Apple', 'iPhone 16 Plus', 'celular', PHONE),
  M('Apple', 'iPhone 16', 'celular', PHONE),
  M('Apple', 'iPhone 16e', 'celular', PHONE),
  M('Apple', 'iPhone 15 Pro Max', 'celular', PRO),
  M('Apple', 'iPhone 15 Pro', 'celular', ['128GB', ...PRO]),
  M('Apple', 'iPhone 15 Plus', 'celular', PHONE),
  M('Apple', 'iPhone 15', 'celular', PHONE),
  M('Apple', 'iPhone 14', 'celular', PHONE),
  M('Apple', 'iPhone 13', 'celular', ['128GB', '256GB']),
  M('Samsung', 'Galaxy S25 Ultra', 'celular', PRO),
  M('Samsung', 'Galaxy S25+', 'celular', ['256GB', '512GB']),
  M('Samsung', 'Galaxy S25', 'celular', PHONE),
  M('Samsung', 'Galaxy S25 FE', 'celular', ['128GB', '256GB']),
  M('Samsung', 'Galaxy S24 Ultra', 'celular', PRO),
  M('Samsung', 'Galaxy S24', 'celular', ['128GB', '256GB']),
  M('Samsung', 'Galaxy Z Fold7', 'celular', ['256GB', '512GB']),
  M('Samsung', 'Galaxy Z Flip7', 'celular', ['256GB', '512GB']),
  M('Samsung', 'Galaxy A56', 'celular', ['128GB', '256GB']),
  M('Samsung', 'Galaxy A36', 'celular', ['128GB', '256GB']),
  M('Samsung', 'Galaxy A26', 'celular', ['128GB', '256GB']),
  M('Samsung', 'Galaxy A16', 'celular', ['128GB', '256GB']),
  M('Samsung', 'Galaxy A06', 'celular', ['64GB', '128GB']),
  M('Motorola', 'Moto G85', 'celular', ['256GB']),
  M('Motorola', 'Moto G55', 'celular', ['256GB']),
  M('Motorola', 'Moto G35', 'celular', ['256GB']),
  M('Motorola', 'Moto G15', 'celular', ['256GB']),
  M('Motorola', 'Edge 60 Pro', 'celular', ['512GB']),
  M('Motorola', 'Edge 60 Fusion', 'celular', ['256GB', '512GB']),
  M('Motorola', 'Razr 60 Ultra', 'celular', ['512GB']),
  M('Xiaomi', 'Redmi Note 14 Pro', 'celular', ['256GB', '512GB']),
  M('Xiaomi', 'Redmi Note 14', 'celular', ['128GB', '256GB']),
  M('Xiaomi', 'Redmi 14C', 'celular', ['128GB', '256GB']),
  M('Xiaomi', 'Xiaomi 15', 'celular', ['512GB']),
  M('Xiaomi', 'Poco X7 Pro', 'celular', ['256GB', '512GB']),
  M('Google', 'Pixel 9', 'celular', ['128GB', '256GB']),
  M('Google', 'Pixel 9a', 'celular', ['128GB', '256GB']),
  M('Honor', 'Magic7 Lite', 'celular', ['256GB', '512GB']),
  M('Oppo', 'Reno13', 'celular', ['256GB']),
  // Pantallas
  M('Samsung', 'Crystal UHD DU7000', 'pantalla', TV),
  M('Samsung', 'Crystal UHD DU8000', 'pantalla', TV),
  M('Samsung', 'QLED Q60D', 'pantalla', TV),
  M('Samsung', 'Neo QLED QN85D', 'pantalla', TV_BIG),
  M('Samsung', 'OLED S90D', 'pantalla', ['55 pulgadas', '65 pulgadas']),
  M('Samsung', 'The Frame', 'pantalla', ['43 pulgadas', '55 pulgadas', '65 pulgadas']),
  M('LG', 'OLED C4', 'pantalla', ['48 pulgadas', '55 pulgadas', '65 pulgadas', '77 pulgadas']),
  M('LG', 'OLED B4', 'pantalla', ['55 pulgadas', '65 pulgadas']),
  M('LG', 'UHD UT80', 'pantalla', TV),
  M('LG', 'QNED80', 'pantalla', TV_BIG),
  M('Sony', 'Bravia 7', 'pantalla', TV_BIG),
  M('Sony', 'Bravia 3', 'pantalla', TV),
  M('TCL', 'C655', 'pantalla', TV),
  M('TCL', 'P755', 'pantalla', TV),
  M('Hisense', 'U7N', 'pantalla', TV_BIG),
  M('Hisense', 'A6N', 'pantalla', TV),
  M('Roku', 'Roku TV Select', 'pantalla', ['43 pulgadas', '50 pulgadas', '55 pulgadas']),
  // Consolas
  M('Nintendo', 'Switch 2', 'consola', ['consola sola', 'Mario Kart World']),
  M('Nintendo', 'Switch OLED', 'consola'),
  M('Nintendo', 'Switch Lite', 'consola'),
  M('Sony', 'PlayStation 5', 'consola', ['Slim', 'Pro', 'Digital']),
  M('Sony', 'PlayStation 5 Slim', 'consola', ['con disco', 'digital']),
  M('Sony', 'PlayStation 5 Pro', 'consola'),
  M('Sony', 'DualSense', 'consola'),
  M('Microsoft', 'Xbox Series X', 'consola', ['1TB', '2TB']),
  M('Microsoft', 'Xbox Series S', 'consola', ['512GB', '1TB']),
  M('Valve', 'Steam Deck OLED', 'consola', ['512GB', '1TB']),
  M('Asus', 'ROG Ally X', 'consola'),
  // Laptops y cómputo
  M('Apple', 'MacBook Air M4', 'laptop', ['13 pulgadas', '15 pulgadas']),
  M('Apple', 'MacBook Air M3', 'laptop', ['13 pulgadas', '15 pulgadas']),
  M('Apple', 'MacBook Pro M4', 'laptop', ['14 pulgadas', '16 pulgadas']),
  M('Apple', 'Mac mini M4', 'computo'),
  M('Lenovo', 'IdeaPad Slim 3', 'laptop', ['15 pulgadas', '16 pulgadas']),
  M('Lenovo', 'IdeaPad Slim 5', 'laptop', ['14 pulgadas', '16 pulgadas']),
  M('Lenovo', 'LOQ 15', 'laptop'),
  M('Lenovo', 'ThinkPad E14', 'laptop'),
  M('HP', 'Pavilion 15', 'laptop'),
  M('HP', 'Victus 15', 'laptop'),
  M('HP', 'OmniBook 5', 'laptop'),
  M('Dell', 'Inspiron 15', 'laptop'),
  M('Dell', 'Inspiron 14', 'laptop'),
  M('Acer', 'Aspire 5', 'laptop'),
  M('Acer', 'Nitro V 15', 'laptop'),
  M('Asus', 'Vivobook 15', 'laptop'),
  M('Asus', 'TUF Gaming A15', 'laptop'),
  M('Microsoft', 'Surface Laptop 7', 'laptop'),
  M('Samsung', 'Galaxy Book5', 'laptop'),
  M('Nvidia', 'GeForce RTX 5070', 'computo'),
  M('Nvidia', 'GeForce RTX 5060 Ti', 'computo'),
  M('Nvidia', 'GeForce RTX 4060', 'computo'),
  M('AMD', 'Ryzen 7 9800X3D', 'computo'),
  M('AMD', 'Ryzen 5 7600X', 'computo'),
  M('Intel', 'Core i5-14400F', 'computo'),
  M('Samsung', '990 Pro', 'computo', ['1TB', '2TB']),
  M('Kingston', 'NV3', 'computo', ['1TB', '2TB']),
  M('Logitech', 'MX Master 3S', 'computo'),
  M('Logitech', 'G502 Hero', 'computo'),
  // Tabletas y relojes
  M('Apple', 'iPad 11', 'tableta', ['128GB', '256GB']),
  M('Apple', 'iPad Air M3', 'tableta', ['11 pulgadas', '13 pulgadas']),
  M('Apple', 'iPad Pro M4', 'tableta', ['11 pulgadas', '13 pulgadas']),
  M('Apple', 'iPad mini A17 Pro', 'tableta'),
  M('Samsung', 'Galaxy Tab S10 FE', 'tableta'),
  M('Samsung', 'Galaxy Tab A9+', 'tableta'),
  M('Amazon', 'Fire HD 10', 'tableta'),
  M('Apple', 'Apple Watch Series 10', 'reloj', ['42mm', '46mm']),
  M('Apple', 'Apple Watch SE', 'reloj', ['40mm', '44mm']),
  M('Apple', 'Apple Watch Ultra 2', 'reloj'),
  M('Samsung', 'Galaxy Watch8', 'reloj', ['40mm', '44mm']),
  M('Garmin', 'Forerunner 165', 'reloj'),
  M('Xiaomi', 'Smart Band 9', 'reloj'),
  // Audio
  M('Apple', 'AirPods Pro 2', 'audio'),
  M('Apple', 'AirPods 4', 'audio', ['con cancelación de ruido']),
  M('Apple', 'AirPods Max', 'audio'),
  M('Sony', 'WH-1000XM5', 'audio'),
  M('Sony', 'WH-1000XM6', 'audio'),
  M('Sony', 'WF-1000XM5', 'audio'),
  M('Sony', 'WH-CH520', 'audio'),
  M('Bose', 'QuietComfort Ultra', 'audio'),
  M('Bose', 'SoundLink Flex', 'audio'),
  M('JBL', 'Flip 7', 'audio'),
  M('JBL', 'Charge 6', 'audio'),
  M('JBL', 'Tune 520BT', 'audio'),
  M('Samsung', 'Galaxy Buds3 Pro', 'audio'),
  M('Samsung', 'Barra de sonido HW-Q600', 'audio'),
  M('LG', 'XBOOM', 'audio'),
  // Hogar
  M('Mabe', 'Refrigerador 14 pies', 'hogar'),
  M('Mabe', 'Refrigerador 19 pies', 'hogar'),
  M('Whirlpool', 'Refrigerador 18 pies', 'hogar'),
  M('Samsung', 'Refrigerador French Door 28 pies', 'hogar'),
  M('LG', 'Refrigerador InstaView', 'hogar'),
  M('Mabe', 'Lavadora 20 kg', 'hogar'),
  M('Whirlpool', 'Lavadora 22 kg', 'hogar'),
  M('LG', 'Lavadora 20 kg AI DD', 'hogar'),
  M('Samsung', 'Lavasecadora 20 kg', 'hogar'),
  M('Mabe', 'Estufa 30 pulgadas', 'hogar'),
  M('Whirlpool', 'Horno de microondas 1.1 pies', 'hogar'),
  M('LG', 'Minisplit Dual Inverter 1 tonelada', 'hogar'),
  M('Mirage', 'Minisplit Inverter 1 tonelada', 'hogar'),
  M('Ninja', 'Freidora de aire 6.5 litros', 'hogar'),
  M('Oster', 'Licuadora Xpert Series', 'hogar'),
  M('Oster', 'Licuadora Pro 1200', 'hogar'),
  M('Nutribullet', 'Pro 900', 'hogar'),
  M('Nespresso', 'Vertuo Pop', 'hogar'),
  M('Dyson', 'V12 Detect Slim', 'hogar'),
  M('Dyson', 'Airwrap', 'hogar'),
  M('iRobot', 'Roomba Combo', 'hogar'),
  M('Xiaomi', 'Robot Vacuum S20', 'hogar'),
  M('Instant Pot', 'Duo 6 cuartos', 'hogar'),
  M('KitchenAid', 'Batidora Artisan', 'hogar'),
  M('T-fal', 'Batería de cocina 12 piezas', 'hogar'),
  // Foto
  M('Canon', 'EOS R50', 'foto'),
  M('Sony', 'ZV-E10 II', 'foto'),
  M('GoPro', 'Hero 13 Black', 'foto'),
  M('DJI', 'Osmo Pocket 3', 'foto'),
  M('DJI', 'Mini 4K', 'foto'),
  M('Fujifilm', 'Instax Mini 12', 'foto'),
];

/** Texto con el que se busca un modelo: la marca va adelante salvo que el nombre ya la traiga ("Apple Watch"). */
export function modelSearchText(m: KnownModel, variant?: string): string {
  const base = m.model.toLowerCase().startsWith(m.brand.toLowerCase()) ? m.model : `${m.brand} ${m.model}`;
  return variant ? `${base} ${variant}` : base;
}
