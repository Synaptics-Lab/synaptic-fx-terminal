import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Synaptic FX Terminal | ISO 20022 × Solana",
  description:
    "The world's first FINOS FDC3 3.0 compliant institutional FX terminal on Solana. StartPayment intent → pacs.008 XML → Token-2022 settlement.",
};

/* Theme bootstrap. Light (Issue) is the default presentation; Carbon applies
   as a lightness stop under [data-theme="dark"]. When the terminal is
   embedded by the BankerX+ desk, the desk posts {type:"bx-theme", theme} from
   the estate hosts of record below; standalone visits keep the default. The
   script is inline and synchronous so the first paint already carries it. */
const THEME_BOOTSTRAP = `
(function () {
  var ROOTS = [
    "https://bankerx.synapticchain.xyz",
    "https://bankerxplus.synapticchain.xyz",
    "https://terminal.synapticchain.xyz",
    "https://fx.synapticchain.xyz"
  ];
  function setTheme(t) {
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  }
  window.addEventListener("message", function (e) {
    if (ROOTS.indexOf(e.origin) !== -1 && e.data && e.data.type === "bx-theme") setTheme(e.data.theme);
  });
})();
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased"
        style={{
          fontFamily:
            "'IBM Plex Mono', 'Cascadia Code', 'Consolas', monospace",
        }}
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        {children}
      </body>
    </html>
  );
}