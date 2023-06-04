import { hydrateRoot, Root } from "react-dom/client";
import { ReactNode } from "react";

declare global {
  interface Window {
    __INITIAL_CLIENT_JSX_STRING__: string;
  }
}

const root: Root = hydrateRoot(document, getInitialClientJSX());
let currentPathname: string = window.location.pathname;

async function navigate(pathname: string): Promise<void> {
  currentPathname = pathname;
  const clientJSX: ReactNode = await fetchClientJSX(pathname);
  if (pathname === currentPathname) {
    root.render(clientJSX);
  }
}

function getInitialClientJSX(): ReactNode {
  const clientJSX: ReactNode = JSON.parse(window.__INITIAL_CLIENT_JSX_STRING__, parseJSX);
  return clientJSX;
}

async function fetchClientJSX(pathname: string): Promise<ReactNode> {
  const response: Response = await fetch(pathname + "?jsx");
  const clientJSXString: string = await response.text();
  const clientJSX: ReactNode = JSON.parse(clientJSXString, parseJSX);
  return clientJSX;
}

function parseJSX(key: string, value: any): any {
  if (value === "$RE") {
    return Symbol.for("react.element");
  } else if (typeof value === "string" && value.startsWith("$$")) {
    return value.slice(1);
  } else {
    return value;
  }
}

window.addEventListener(
  "click",
  (e: MouseEvent) => {
    const target = e.target as HTMLAnchorElement;
    if (target.tagName !== "A") {
      return;
    }
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    const href: string | null = target.getAttribute("href");
    if (href && !href.startsWith("/")) {
      return;
    }
    e.preventDefault();
    if (href) {
        //@ts-expect-error Dan Abramov says this is fine
      window.history.pushState(null, null, href);
      navigate(href);
    }
  },
  true
);

window.addEventListener("popstate", () => {
  navigate(window.location.pathname);
});
