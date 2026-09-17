import type { Page, Route } from "@playwright/test";

type Item = { id: string; text: string; done: boolean };
type Label = { id: string; name: string; color: string };
type Card = {
  id: string;
  title: string;
  details: string;
  priority: "none" | "low" | "medium" | "high";
  due_date: string | null;
  label_ids: string[];
  checklist: Item[];
};
type Column = { id: string; title: string; cards: Card[] };
type Board = {
  id: string;
  name: string;
  description: string;
  labels: Label[];
  columns: Column[];
};

const card = (id: string, title: string, details: string): Card => ({
  id,
  title,
  details,
  priority: "none",
  due_date: null,
  label_ids: [],
  checklist: [],
});

const demoBoard = (): Board => ({
  id: "board-1",
  name: "Product Roadmap",
  description: "",
  labels: [
    { id: "label-design", name: "Design", color: "yellow" },
    { id: "label-research", name: "Research", color: "blue" },
  ],
  columns: [
    {
      id: "col-backlog",
      title: "Backlog",
      cards: [
        card("card-1", "Align roadmap themes", "Draft quarterly themes with impact statements."),
        card("card-2", "Gather customer signals", "Review support tags and churn feedback."),
      ],
    },
    {
      id: "col-discovery",
      title: "Discovery",
      cards: [card("card-3", "Prototype analytics view", "Sketch dashboard layout.")],
    },
    { id: "col-progress", title: "In Progress", cards: [card("card-4", "Refine status language", "")] },
    { id: "col-review", title: "Review", cards: [card("card-5", "QA micro-interactions", "")] },
    { id: "col-done", title: "Done", cards: [card("card-6", "Ship marketing page", "")] },
  ],
});

const DEFAULT_COLUMNS = ["Backlog", "Discovery", "In Progress", "Review", "Done"];

/**
 * An in-memory stand-in for the FastAPI backend, installed with page.route.
 * State lives for one test, so flows can create, edit and reload realistically.
 */
export class MockApi {
  users = new Map<string, { password: string; boards: Board[] }>([
    ["user", { password: "password", boards: [demoBoard()] }],
  ]);
  session: string | null = null;
  expireSessionOnNextRequest = false;
  private nextId = 100;

  static async install(page: Page, options: { signedInAs?: string } = {}) {
    const api = new MockApi();
    api.session = options.signedInAs ?? null;
    await page.route("**/api/**", (route) => api.handle(route));
    return api;
  }

  private id(prefix: string) {
    this.nextId += 1;
    return `${prefix}-${this.nextId}`;
  }

  private boards() {
    return this.users.get(this.session!)!.boards;
  }

  private findColumn(columnId: string) {
    for (const board of this.boards()) {
      const column = board.columns.find((c) => c.id === columnId);
      if (column) return { board, column };
    }
    return null;
  }

  private findCard(cardId: string) {
    for (const board of this.boards()) {
      for (const column of board.columns) {
        const index = column.cards.findIndex((c) => c.id === cardId);
        if (index !== -1) return { board, column, index, card: column.cards[index] };
      }
    }
    return null;
  }

  private async handle(route: Route) {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    const body = request.postDataJSON() ?? {};
    const json = (status: number, data?: unknown) =>
      data === undefined ? route.fulfill({ status }) : route.fulfill({ status, json: data });
    const notFound = () => json(404, { detail: "Not found" });

    if (path === "/api/login" && method === "POST") {
      const user = this.users.get(body.username);
      if (!user || user.password !== body.password) {
        return json(401, { detail: "Invalid credentials" });
      }
      this.session = body.username;
      return json(200, { username: body.username });
    }
    if (path === "/api/register" && method === "POST") {
      if (this.users.has(body.username)) return json(409, { detail: "Username is already taken" });
      const board: Board = {
        id: this.id("board"),
        name: "My First Board",
        description: "",
        labels: [],
        columns: DEFAULT_COLUMNS.map((title) => ({ id: this.id("col"), title, cards: [] })),
      };
      this.users.set(body.username, { password: body.password, boards: [board] });
      this.session = body.username;
      return json(201, { username: body.username });
    }
    if (path === "/api/logout") {
      this.session = null;
      return json(204);
    }
    if (!this.session || this.expireSessionOnNextRequest) {
      this.session = null;
      this.expireSessionOnNextRequest = false;
      return json(401, { detail: "Not authenticated" });
    }
    if (path === "/api/me") return json(200, { username: this.session });

    if (path === "/api/boards") {
      if (method === "GET") {
        return json(
          200,
          this.boards().map((b) => ({
            id: b.id,
            name: b.name,
            description: b.description,
            card_count: b.columns.reduce((n, c) => n + c.cards.length, 0),
          }))
        );
      }
      const board: Board = {
        id: this.id("board"),
        name: body.name,
        description: body.description ?? "",
        labels: [],
        columns: DEFAULT_COLUMNS.map((title) => ({ id: this.id("col"), title, cards: [] })),
      };
      this.boards().push(board);
      return json(201, board);
    }

    let match = path.match(/^\/api\/boards\/([^/]+)(\/columns|\/chat|\/labels)?$/);
    if (match) {
      const board = this.boards().find((b) => b.id === match![1]);
      if (!board) return notFound();
      if (match[2] === "/labels") {
        if (board.labels.some((l) => l.name.toLowerCase() === body.name.toLowerCase())) {
          return json(409, { detail: "A label with that name already exists" });
        }
        const label = { id: this.id("label"), name: body.name, color: body.color };
        board.labels.push(label);
        board.labels.sort((a, b) => a.name.localeCompare(b.name));
        return json(201, label);
      }
      if (match[2] === "/columns") {
        const column = { id: this.id("col"), title: body.title, cards: [] };
        board.columns.push(column);
        return json(201, column);
      }
      if (match[2] === "/chat") return json(200, { reply: `Mock reply to: ${body.message}`, board });
      if (method === "GET") return json(200, board);
      if (method === "PATCH") {
        Object.assign(board, body);
        return json(200, board);
      }
      const list = this.boards();
      list.splice(list.indexOf(board), 1);
      return json(204);
    }

    match = path.match(/^\/api\/columns\/([^/]+)(\/move|\/cards)?$/);
    if (match) {
      const found = this.findColumn(match[1]);
      if (!found) return notFound();
      const { board, column } = found;
      if (match[2] === "/cards") {
        const created: Card = {
          id: this.id("card"),
          title: body.title,
          details: body.details ?? "",
          priority: body.priority ?? "none",
          due_date: body.due_date ?? null,
          label_ids: body.label_ids ?? [],
          checklist: [],
        };
        column.cards.push(created);
        return json(201, created);
      }
      if (match[2] === "/move") {
        board.columns.splice(board.columns.indexOf(column), 1);
        board.columns.splice(body.index, 0, column);
        return json(204);
      }
      if (method === "PATCH") {
        column.title = body.title;
        return json(204);
      }
      board.columns.splice(board.columns.indexOf(column), 1);
      return json(204);
    }

    match = path.match(/^\/api\/labels\/([^/]+)$/);
    if (match) {
      for (const board of this.boards()) {
        const label = board.labels.find((l) => l.id === match![1]);
        if (!label) continue;
        if (method === "PATCH") {
          Object.assign(label, body);
          return json(200, label);
        }
        board.labels.splice(board.labels.indexOf(label), 1);
        board.columns.forEach((c) =>
          c.cards.forEach((cd) => (cd.label_ids = cd.label_ids.filter((id) => id !== label.id)))
        );
        return json(204);
      }
      return notFound();
    }

    match = path.match(/^\/api\/checklist\/([^/]+)$/);
    if (match) {
      for (const board of this.boards()) {
        for (const column of board.columns) {
          for (const cd of column.cards) {
            const item = cd.checklist.find((i) => i.id === match![1]);
            if (!item) continue;
            if (method === "PATCH") {
              Object.assign(item, body);
              return json(200, item);
            }
            cd.checklist.splice(cd.checklist.indexOf(item), 1);
            return json(204);
          }
        }
      }
      return notFound();
    }

    match = path.match(/^\/api\/cards\/([^/]+)(\/move|\/checklist)?$/);
    if (match) {
      const found = this.findCard(match[1]);
      if (!found) return notFound();
      if (match[2] === "/checklist") {
        const item = { id: this.id("item"), text: body.text, done: false };
        found.card.checklist.push(item);
        return json(201, item);
      }
      if (match[2] === "/move") {
        const target = this.findColumn(body.column_id);
        if (!target) return notFound();
        found.column.cards.splice(found.index, 1);
        target.column.cards.splice(body.index ?? target.column.cards.length, 0, found.card);
        return json(200, found.card);
      }
      if (method === "PATCH") {
        Object.assign(found.card, body);
        return json(200, found.card);
      }
      found.column.cards.splice(found.index, 1);
      return json(204);
    }

    return notFound();
  }
}
