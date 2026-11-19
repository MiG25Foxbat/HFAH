import type { Metadata } from "next";
import { DocPage, Section, linkClass } from "@/components/info/parts";

export const metadata: Metadata = {
  title: "Источники и лицензии",
  description: "Откуда взяты 3D-персонажи, шрифты и библиотеки сайта, и на каких лицензиях они используются.",
  alternates: { canonical: "/credits" },
};

/** Лицензии проверены по полю license в node_modules/<пакет>/package.json на 19 ноября 2026; версии — из package-lock.json. */
const LIBRARIES: { name: string; href: string; version: string; license: string }[] = [
  { name: "three.js", href: "https://threejs.org", version: "0.187.0", license: "MIT" },
  { name: "React Three Fiber", href: "https://github.com/pmndrs/react-three-fiber", version: "9.8.2", license: "MIT" },
  { name: "drei", href: "https://github.com/pmndrs/drei", version: "10.7.9", license: "MIT" },
  { name: "Next.js", href: "https://nextjs.org", version: "16.4.6", license: "MIT" },
  { name: "React", href: "https://react.dev", version: "19.3.0", license: "MIT" },
  { name: "Motion", href: "https://motion.dev", version: "14.14.0", license: "MIT" },
  { name: "Tailwind CSS", href: "https://tailwindcss.com", version: "4.3.3", license: "MIT" },
  { name: "zod", href: "https://zod.dev", version: "4.6.7", license: "MIT" },
  { name: "postgres", href: "https://github.com/porsager/postgres", version: "4.1.1", license: "Unlicense" },
  { name: "sharp", href: "https://sharp.pixelplumbing.com", version: "0.35.5", license: "Apache-2.0; в составе — libvips под LGPL-3.0-or-later" },
];

export default function CreditsPage() {
  return (
    <DocPage
      title="Источники и лицензии"
      lead="Что на этом сайте сделано специально для него, что взято у других и на каких условиях. Если вы заберёте проект себе, этот список переходит вместе с ним."
    >
      <Section id="models" title="3D-персонажи">
        <p>
          Пять персонажей — шкаф, смеситель, настольная лампа, малярный валик и ящик с инструментами — <strong className="font-medium">нарисованы для этого проекта с нуля</strong> в Blender 5.3: геометрия, развёртка,
          материалы, опорные точки для рук и лица, анимации покоя, приветствия и моргания. Чужих моделей, текстур и HDRI в них нет.
        </p>
        <p>
          Бесплатные модели с лицензией CC0 мы искали: Poly Haven, Kenney, Quaternius, ambientCG. Подходящих по конструкции и стилю не нашлось, поэтому ничего оттуда не использовано и ссылаться не
          на что. Записи поиска лежат в исходниках проекта: <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.875rem]">assets-src/blender/sources/_search-notes/</code>.
        </p>
        <p>
          Файл <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.875rem]">.blend</code> и скрипты сборки передаются владельцу проекта вместе с сайтом. Модели можно использовать, менять и передавать дальше вместе
          с исходниками, указывать авторство не обязательно.
        </p>
        <p className="text-muted">
          Инструменты: Blender (GPL; на файлы, созданные в нём, лицензия не распространяется), glTF-Transform (MIT), meshoptimizer (MIT; декодер входит в состав three.js). Постеры персонажей без
          3D отрисованы в Blender из тех же моделей.
        </p>
      </Section>

      <Section id="fonts" title="Шрифты">
        <ul className="grid gap-2">
          <li>
            <a href="https://github.com/googlefonts/golos-text" className={linkClass}>Golos Text</a> — весь интерфейс. © 2019 The Golos Text Project Authors, лицензия SIL Open Font License 1.1.
          </li>
          <li>
            <a href="https://github.com/googlefonts/unbounded" className={linkClass}>Unbounded</a> — знак «запросто» и заголовок главной. © 2022 The Unbounded Project Authors, лицензия SIL Open Font License 1.1.
          </li>
        </ul>
        <p>
          Текст лицензии: <a href="https://openfontlicense.org" className={linkClass}>openfontlicense.org</a>. Шрифты подключены через next/font и отдаются с самого сайта, при открытии страниц запросов к серверам Google нет.
        </p>
      </Section>

      <Section id="libraries" title="Библиотеки">
        <p>Сайт собран на открытых библиотеках. Версии и лицензии указаны так, как они записаны в package.json самих пакетов.</p>
        <div className="max-w-full overflow-x-auto">
          <table className="w-full min-w-[420px] border-collapse text-left text-[0.9375rem]">
            <caption className="sr-only">Библиотеки, версии и лицензии</caption>
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-2 pr-4 font-medium">Пакет</th>
                <th scope="col" className="py-2 pr-4 font-medium">Версия</th>
                <th scope="col" className="py-2 font-medium">Лицензия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {LIBRARIES.map((l) => (
                <tr key={l.name}>
                  <th scope="row" className="py-2.5 pr-4 align-top font-medium">
                    <a href={l.href} className={linkClass}>{l.name}</a>
                  </th>
                  <td className="py-2.5 pr-4 align-top tabular-nums">{l.version}</td>
                  <td className="py-2.5 align-top">{l.license}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-muted">
          Лицензии MIT, Apache-2.0 и Unlicense разрешают коммерческое использование. Условия LGPL-3.0 касаются библиотеки libvips, которая поставляется вместе с sharp в виде отдельной динамической библиотеки.
        </p>
      </Section>

      <Section id="own" title="Значок и картинка для соцсетей">
        <p>
          Значок приложения (буква «л» в кольце делений) нарисован для проекта и собирается скриптом из линий, без чужих изображений. Картинка для соцсетей составлена из знака, постера ящика
          с инструментами и шрифтов выше. Скрипты лежат в исходниках: <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.875rem]">scripts/make-icons.mjs</code> и{" "}
          <code className="rounded bg-surface-2 px-1.5 py-0.5 text-[0.875rem]">scripts/make-og.mjs</code>.
        </p>
      </Section>

      <Section id="demo" title="Демо-данные">
        <p>Цены, названия работ и компании в демонстрационной версии вымышлены. Реальные контакты и реквизиты владелец вносит сам.</p>
      </Section>
    </DocPage>
  );
}
