import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  Client,
  LogLevel,
  isNotionClientError,
  isFullPage,
} from "@notionhq/client";
import type { PageObjectResponse } from "@notionhq/client/build/src/api-endpoints";

type Bindings = {
  NOTION_TOKEN: string;
  NOTION_DATABASE_ID: string;
};

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  "*",
  cors({
    origin: [
      "https://portfolio-vite-ept.pages.dev",
      "http://localhost:4173",
      "http://localhost:5173",
    ],
    allowMethods: ["GET", "POST", "PUT"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

interface NotionPostType {
  id: string;
  title: string;
  thumbnail?: string;
  projectYear?: number;
  tags?: string[];
  publicLink?: string;
}

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

const fetchAllPosts = async (
  token: string,
  databaseId: string
): Promise<NotionPostType[] | undefined> => {
  let allPosts: PageObjectResponse[] = [];
  let cursor: string | null;
  let hasMore = true;

  const notion = new Client({
    auth: token,
    logLevel: LogLevel.DEBUG,
  });

  try {
    while (hasMore) {
      const response = await notion.databases.query({
        database_id: databaseId,
        sorts: [
          {
            property: "Year",
            direction: "descending",
          },
        ],
        filter: {
          and: [
            {
              property: "Published",
              checkbox: {
                equals: true,
              },
            },
          ],
        },
      });
      hasMore = response.has_more;
      cursor = response.next_cursor;
      response.results.forEach((post) => {
        if (isFullPage(post)) {
          allPosts.push(post as PageObjectResponse);
        }
      });
      const projectPosts: NotionPostType[] = [];
      allPosts.map((post) => {
        projectPosts.push({
          id: post.id,
          title: getTitle(post),
          thumbnail: getThumbnailUrl(post),
          projectYear: getProjectYear(post),
          tags: getTags(post),
          publicLink: getPublicLink(post),
        });
      });
      //console.log("aaa", projectPosts);
      return projectPosts;
      //return response.results;
    }
  } catch (error: unknown) {
    if (isNotionClientError(error)) {
      console.log(error);
    } else {
      return [];
    }
  }
};

//いちいち型制約を書かなくても良いようにしたい
const getTitle = (page: PageObjectResponse): string => {
  const title = page.properties.Title;
  return title.type === "title" && title.title.length > 0
    ? title.title[0].plain_text
    : "";
};

const getThumbnailUrl = (page: PageObjectResponse): string => {
  const thumbnailUrl = page.properties.Thumbnail;
  if (thumbnailUrl.type === "files" && thumbnailUrl.files.length > 0) {
    switch (thumbnailUrl.files[0].type) {
      case "external":
        return thumbnailUrl.files[0].external.url;
      case "file":
        return thumbnailUrl.files[0].file.url;
    }
  }
  return ""; // デフォルトの返り値
};

const getTags = (page: PageObjectResponse): string[] => {
  const tags = page.properties.Tags;
  return tags.type === "multi_select" && tags.multi_select.length > 0
    ? tags.multi_select.map((val) => val.name)
    : [];
};

const getProjectYear = (page: PageObjectResponse): number | undefined => {
  const projectYear = page.properties.Year;
  return projectYear.type === "number" && projectYear.number
    ? projectYear.number
    : undefined;
};

const getPublicLink = (page: PageObjectResponse): string => {
  const Url = page.public_url;
  if (Url) {
    return Url;
  } else {
    return "";
  }
};

app.get("/projects", async (c) => {
  const projects = await fetchAllPosts(
    c.env.NOTION_TOKEN,
    c.env.NOTION_DATABASE_ID
  );
  return c.json(projects);
});

export default app;
