import { app, BrowserWindow } from "electron";
import * as path from "path";

import { createServer, IncomingMessage, ServerResponse } from "http";
import { readFile, readdir } from "fs/promises";
import { renderToString } from "react-dom/server";
import sanitizeFilename from "sanitize-filename";
import { URL } from "url";
import { join as pathJoin } from "path";
import { ReactNode } from "react";

createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  if (url.pathname === "/client.js") {
    sendScript(res, pathJoin(__dirname, "./client.js"));
    return;
  }
  try {
    if (url.searchParams.has("jsx")) {
      url.searchParams.delete("jsx");
      await sendJSX(res, <Router url={url} />);
    } else {
      await sendHTML(res, <Router url={url} />);
    }
  } catch (err: any) {
    console.error(err);
    res.writeHead(err.statusCode ?? 500);
    res.end();
  }
}).listen(8080);

interface RouterProps {
  url: URL;
}

function Router({ url }: RouterProps): JSX.Element {
  let page: JSX.Element;
  if (url.pathname === "/") {
    // @ts-expect-error Async Server Components
    page = <BlogIndexPage />;
  } else if (!url.pathname.includes(".")) {
    const postSlug = sanitizeFilename(url.pathname.slice(1));
    page = <BlogPostPage postSlug={postSlug} />;
  } else {
    const notFound = new Error("Not found.");
    // @ts-expect-error I'm to lazy to fix this
    notFound.statusCode = 404;
    throw notFound;
  }
  return <BlogLayout>{page}</BlogLayout>;
}

async function BlogIndexPage(): Promise<JSX.Element> {
  const postFiles = await readdir(pathJoin(__dirname, "./posts"));
  const postSlugs = postFiles.map((file) =>
    file.slice(0, file.lastIndexOf("."))
  );
  return (
    <section>
      <h1>Welcome to my blog</h1>
      <div>
        {postSlugs.map((slug) => (
          // @ts-expect-error Async Server Components
          <Post key={slug} slug={slug} />
        ))}
      </div>
    </section>
  );
}

interface BlogPostPageProps {
  postSlug: string;
}

function BlogPostPage({ postSlug }: BlogPostPageProps): JSX.Element {
  // @ts-expect-error Async Server Components
  return <Post slug={postSlug} />;
}

interface PostProps {
  slug: string;
}

async function Post({ slug }: PostProps): Promise<JSX.Element> {
  const content = await readFile(pathJoin(__dirname, "./posts", `${slug}.txt`), "utf8");
  return (
    <section>
      <h2>
        <a href={"/" + slug}>{slug}</a>
      </h2>
      <article>{content}</article>
    </section>
  );
}

interface BlogLayoutProps {
  children: ReactNode;
}

function BlogLayout({ children }: BlogLayoutProps): JSX.Element {
  const author = "Jae Doe";
  return (
    <html>
      <head>
        <title>My blog</title>
      </head>
      <body>
        <nav>
          <a href="/">Home</a>
          <hr />
          <input />
          <hr />
        </nav>
        <main>{children}</main>
        <Footer author={author} />
      </body>
    </html>
  );
}

interface FooterProps {
  author: string;
}

function Footer({ author }: FooterProps): JSX.Element {
  return (
    <footer>
      <hr />
      <p>
        <i>
          (c) {author} {new Date().getFullYear()}
        </i>
      </p>
    </footer>
  );
}

async function sendScript(res: ServerResponse, filename: string): Promise<void> {
  const content = await readFile(filename, "utf8");
  res.writeHead(200, { "Content-Type": "text/javascript" });
  res.end(content);
}

async function sendJSX(res: ServerResponse, jsx: JSX.Element): Promise<void> {
  const clientJSX = await renderJSXToClientJSX(jsx);
  const clientJSXString = JSON.stringify(clientJSX, stringifyJSX);
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(clientJSXString);
}

async function sendHTML(res: ServerResponse, jsx: JSX.Element): Promise<void> {
  const clientJSX = await renderJSXToClientJSX(jsx);
  let html = renderToString(clientJSX);
  const clientJSXString = JSON.stringify(clientJSX, stringifyJSX);
  html += `<script>window.__INITIAL_CLIENT_JSX_STRING__ = `;
  html += JSON.stringify(clientJSXString).replace(/</g, "\\u003c");
  html += `</script>`;
  html += `
    <script type="importmap">
      {
        "imports": {
          "react": "https://esm.sh/react@canary",
          "react-dom/client": "https://esm.sh/react-dom@canary/client"
        }
      }
    </script>
    <script type="module" src="/client.js"></script>
  `;
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(html);
}

function stringifyJSX(key: string, value: any): any {
  if (value === Symbol.for("react.element")) {
    return "$RE";
  } else if (typeof value === "string" && value.startsWith("$")) {
    return "$" + value;
  } else {
    return value;
  }
}

async function renderJSXToClientJSX(jsx: any): Promise<any> {
  if (
    typeof jsx === "string" ||
    typeof jsx === "number" ||
    typeof jsx === "boolean" ||
    jsx == null
  ) {
    return jsx;
  } else if (Array.isArray(jsx)) {
    return Promise.all(jsx.map((child) => renderJSXToClientJSX(child)));
  } else if (jsx != null && typeof jsx === "object") {
    if (jsx.$$typeof === Symbol.for("react.element")) {
      if (typeof jsx.type === "string") {
        return {
          ...jsx,
          props: await renderJSXToClientJSX(jsx.props),
        };
      } else if (typeof jsx.type === "function") {
        const Component = jsx.type;
        const props = jsx.props;
        const returnedJsx = await Component(props);
        return renderJSXToClientJSX(returnedJsx);
      } else throw new Error("Not implemented.");
    } else {
      return Object.fromEntries(
        await Promise.all(
          Object.entries(jsx).map(async ([propName, value]) => [
            propName,
            await renderJSXToClientJSX(value),
          ])
        )
      );
    }
  } else throw new Error("Not implemented");
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
    width: 800,
  });

  // and load the index.html of the app.
  mainWindow.loadURL("http://localhost:8080");

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
