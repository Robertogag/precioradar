import { useEffect } from 'react';
import { Link } from 'react-router';
import { useT } from '../i18n/index.ts';

type Kind = 'privacidad' | 'terminos';

const ES: Record<Kind, { title: string; updated: string; sections: { h: string; p: string[] }[] }> = {
  privacidad: {
    title: 'Aviso de privacidad',
    updated: 'Actualizado el 9 de noviembre de 2026',
    sections: [
      {
        h: 'Quién es responsable',
        p: ['PrecioRadar es un proyecto independiente de Juan Roberto García. No pertenece a ninguna tienda ni recibe pago de ellas por aparecer.'],
      },
      {
        h: 'Qué datos se guardan',
        p: [
          'No hay cuentas ni registro. No pedimos nombre, correo ni teléfono.',
          'El servidor guarda el texto de lo que la gente busca (sin asociarlo a una persona) y los precios que las tiendas publican, para el historial de precios y las sugerencias al escribir.',
          'Como cualquier servidor, las bitácoras técnicas de Google Cloud registran la dirección IP de cada petición durante 30 días; se usan solo para limitar abusos y diagnosticar fallas.',
          'Tus ajustes (país, idioma, tema, búsquedas recientes) se guardan únicamente en tu navegador o en tu teléfono; puedes borrarlos desde la app.',
        ],
      },
      {
        h: 'Precios que compartes desde la app',
        p: [
          'En la app de celular, si aceptas, al abrir la página de un producto en Mercado Libre se lee el precio que la tienda te mostró y se envía a PrecioRadar: liga del producto, título, precio y fecha. Nada más. Se enseña a todos como "precio visto por un usuario", sin identificarte. Puedes apagarlo cuando quieras en Ajustes.',
        ],
      },
      {
        h: 'Con quién se comparte',
        p: ['Con nadie para fines comerciales. El servicio corre en Google Cloud (Estados Unidos), que procesa los datos únicamente para operarlo.'],
      },
      {
        h: 'Tus derechos y contacto',
        p: ['Puedes pedir que se elimine cualquier dato que creas tuyo o preguntar lo que quieras escribiendo al autor a través del repositorio del proyecto en GitHub.'],
      },
    ],
  },
  terminos: {
    title: 'Términos de uso',
    updated: 'Actualizado el 9 de noviembre de 2026',
    sections: [
      {
        h: 'Qué es PrecioRadar',
        p: ['Una herramienta informativa para comparar precios publicados por tiendas en línea de México. No vende nada, no cobra comisión y no intermedia la compra.'],
      },
      {
        h: 'Los precios son de las tiendas',
        p: [
          'Cada precio lo publica la tienda correspondiente y puede cambiar en cualquier momento. Cuando una tienda no contesta, se enseña su último precio guardado con la fecha en que se vio y marcado como "sin verificar". Confirma siempre el total, envío e impuestos en la tienda antes de pagar.',
        ],
      },
      {
        h: 'Sin garantías',
        p: ['El servicio se ofrece tal cual, sin garantía de disponibilidad ni de exactitud. El autor no responde por decisiones de compra tomadas con esta información.'],
      },
      {
        h: 'Marcas y logotipos',
        p: ['Los nombres y logotipos de las tiendas pertenecen a sus dueños y se usan solo para identificarlas.'],
      },
      {
        h: 'Uso aceptable',
        p: ['No uses el servicio para saturarlo ni para extraer datos de forma automatizada. Hay límites de peticiones por dirección IP.'],
      },
      {
        h: 'Código abierto',
        p: ['El código está publicado bajo licencia MIT. Puedes revisarlo y proponer mejoras en GitHub.'],
      },
    ],
  },
};

const EN: Record<Kind, { title: string; updated: string; sections: { h: string; p: string[] }[] }> = {
  privacidad: {
    title: 'Privacy notice',
    updated: 'Updated November 9, 2026',
    sections: [
      { h: 'Who is responsible', p: ['PrecioRadar is an independent project by Juan Roberto García. It is not owned by, nor paid by, any store.'] },
      {
        h: 'What is stored',
        p: [
          'There are no accounts. We never ask for your name, email or phone.',
          'The server stores search texts (not linked to a person) and the prices stores publish, for price history and typing suggestions.',
          'Like any server, Google Cloud logs keep the IP address of each request for 30 days, used only to limit abuse and diagnose failures.',
          'Your settings (country, language, theme, recent searches) live only in your browser or phone; you can clear them in the app.',
        ],
      },
      {
        h: 'Prices you share from the app',
        p: [
          'In the mobile app, if you accept, opening a product page on Mercado Libre reads the price the store showed you and sends it to PrecioRadar: product link, title, price and time. Nothing else. It is shown to everyone as "price seen by a user", without identifying you. You can turn it off anytime in Settings.',
        ],
      },
      { h: 'Who it is shared with', p: ['Nobody, for commercial purposes. The service runs on Google Cloud (United States), which processes data only to operate it.'] },
      { h: 'Your rights and contact', p: ['You can ask for any data you believe is yours to be deleted, or ask anything, by writing to the author through the project repository on GitHub.'] },
    ],
  },
  terminos: {
    title: 'Terms of use',
    updated: 'Updated November 9, 2026',
    sections: [
      { h: 'What PrecioRadar is', p: ['An informational tool to compare prices published by Mexican online stores. It sells nothing, charges no commission and does not intermediate purchases.'] },
      {
        h: 'Prices belong to the stores',
        p: ['Each price is published by its store and may change at any time. When a store does not answer, its last recorded price is shown with the time it was seen and marked "not verified". Always confirm the total, shipping and taxes at the store before paying.'],
      },
      { h: 'No warranty', p: ['The service is provided as is, with no guarantee of availability or accuracy. The author is not liable for purchase decisions made with this information.'] },
      { h: 'Trademarks', p: ['Store names and logos belong to their owners and are used only to identify them.'] },
      { h: 'Acceptable use', p: ['Do not overload the service or extract data automatically. Requests are rate-limited per IP address.'] },
      { h: 'Open source', p: ['The code is published under the MIT license. You can review it and propose improvements on GitHub.'] },
    ],
  },
};

/** Aviso de privacidad y términos: texto claro, sin letra chica, en el idioma de la app. */
export function LegalPage({ kind }: { kind: Kind }) {
  const { lang, t } = useT();
  const doc = (lang === 'en' ? EN : ES)[kind];
  useEffect(() => {
    document.title = `${doc.title} · PrecioRadar`;
  }, [doc.title]);
  return (
    <div className="wrap legal">
      <h1 className="legal__title">{doc.title}</h1>
      <p className="legal__updated">{doc.updated}</p>
      {doc.sections.map((s) => (
        <section key={s.h} className="legal__section">
          <h2 className="legal__h">{s.h}</h2>
          {s.p.map((p) => (
            <p key={p.slice(0, 40)}>{p}</p>
          ))}
        </section>
      ))}
      <p className="legal__back">
        <Link to="/">{t((d) => d.footer.back)}</Link>
      </p>
    </div>
  );
}
