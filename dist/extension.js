"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/extension.ts
var extension_exports = {};
__export(extension_exports, {
  activate: () => activate,
  deactivate: () => deactivate
});
module.exports = __toCommonJS(extension_exports);
var vscode2 = __toESM(require("vscode"));
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
var os = __toESM(require("os"));
var import_child_process = require("child_process");

// node_modules/@fly/sprites/dist/exec.js
var import_node_events2 = require("node:events");
var import_node_stream2 = require("node:stream");

// node_modules/@fly/sprites/dist/websocket.js
var import_node_events = require("node:events");
var import_node_stream = require("node:stream");

// node_modules/@fly/sprites/dist/types.js
var StreamID;
(function(StreamID2) {
  StreamID2[StreamID2["Stdin"] = 0] = "Stdin";
  StreamID2[StreamID2["Stdout"] = 1] = "Stdout";
  StreamID2[StreamID2["Stderr"] = 2] = "Stderr";
  StreamID2[StreamID2["Exit"] = 3] = "Exit";
  StreamID2[StreamID2["StdinEOF"] = 4] = "StdinEOF";
})(StreamID || (StreamID = {}));
var ExecError = class extends Error {
  result;
  constructor(message, result) {
    super(message);
    this.result = result;
    this.name = "ExecError";
  }
  get exitCode() {
    return this.result.exitCode;
  }
  get stdout() {
    return this.result.stdout;
  }
  get stderr() {
    return this.result.stderr;
  }
};

// node_modules/@fly/sprites/dist/websocket.js
var WSCommand = class extends import_node_events.EventEmitter {
  url;
  headers;
  ws = null;
  exitCode = -1;
  tty;
  started = false;
  done = false;
  stdout;
  stderr;
  constructor(url, headers, tty = false) {
    super();
    this.url = url;
    this.headers = headers;
    this.tty = tty;
    this.stdout = new import_node_stream.Writable({
      write: () => {
      }
      // No-op, actual writing happens in message handler
    });
    this.stderr = new import_node_stream.Writable({
      write: () => {
      }
      // No-op, actual writing happens in message handler
    });
  }
  /**
   * Start the WebSocket connection
   */
  async start() {
    if (this.started) {
      throw new Error("WSCommand already started");
    }
    this.started = true;
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url, {
          headers: this.headers
        });
        this.ws.binaryType = "arraybuffer";
        this.ws.addEventListener("open", () => {
          resolve();
        });
        this.ws.addEventListener("error", () => {
          const error = new Error("WebSocket error");
          this.emit("error", error);
          if (!this.started) {
            reject(error);
          }
        });
        this.ws.addEventListener("message", (event) => {
          this.handleMessage(event);
        });
        this.ws.addEventListener("close", (event) => {
          this.handleClose(event);
        });
      } catch (error) {
        reject(error);
      }
    });
  }
  /**
   * Handle incoming WebSocket messages
   */
  handleMessage(event) {
    if (this.tty) {
      if (typeof event.data === "string") {
        try {
          const msg = JSON.parse(event.data);
          this.emit("message", msg);
        } catch {
          this.emit("message", event.data);
        }
      } else {
        const buffer = Buffer.from(event.data);
        this.emit("stdout", buffer);
      }
    } else {
      const data = Buffer.from(event.data);
      if (data.length === 0)
        return;
      const streamId = data[0];
      const payload = data.subarray(1);
      switch (streamId) {
        case StreamID.Stdout:
          this.emit("stdout", payload);
          break;
        case StreamID.Stderr:
          this.emit("stderr", payload);
          break;
        case StreamID.Exit:
          this.exitCode = payload.length > 0 ? payload[0] : 0;
          this.close();
          break;
      }
    }
  }
  /**
   * Handle WebSocket close
   */
  handleClose(event) {
    if (!this.done) {
      this.done = true;
      if (this.tty && this.exitCode === -1) {
        this.exitCode = event.code === 1e3 ? 0 : 1;
      }
      this.emit("exit", this.exitCode);
    }
  }
  /**
   * Write data to stdin
   */
  writeStdin(data) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not open");
    }
    if (this.tty) {
      this.ws.send(data);
    } else {
      const message = Buffer.allocUnsafe(data.length + 1);
      message[0] = StreamID.Stdin;
      data.copy(message, 1);
      this.ws.send(message);
    }
  }
  /**
   * Send stdin EOF
   */
  sendStdinEOF() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      return;
    if (!this.tty) {
      const message = Buffer.from([StreamID.StdinEOF]);
      this.ws.send(message);
    }
  }
  /**
   * Send resize control message (TTY only)
   */
  resize(cols, rows) {
    if (!this.tty || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    const msg = { type: "resize", cols, rows };
    this.ws.send(JSON.stringify(msg));
  }
  /**
   * Get the exit code
   */
  getExitCode() {
    return this.exitCode;
  }
  /**
   * Check if the command is done
   */
  isDone() {
    return this.done;
  }
  /**
   * Close the WebSocket connection
   */
  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close(1e3, "");
    }
  }
  /**
   * Wait for the command to complete
   */
  async wait() {
    if (this.done) {
      return this.exitCode;
    }
    return new Promise((resolve) => {
      this.once("exit", (code) => {
        resolve(code);
      });
    });
  }
};

// node_modules/@fly/sprites/dist/exec.js
var SpriteCommand = class extends import_node_events2.EventEmitter {
  sprite;
  stdin;
  stdout;
  stderr;
  wsCmd;
  exitPromise;
  exitResolver;
  started = false;
  constructor(sprite, command, args = [], options = {}) {
    super();
    this.sprite = sprite;
    this.stdin = new import_node_stream2.PassThrough();
    this.stdout = new import_node_stream2.PassThrough();
    this.stderr = new import_node_stream2.PassThrough();
    const url = this.buildWebSocketURL(command, args, options);
    this.wsCmd = new WSCommand(url, {
      "Authorization": `Bearer ${this.sprite.client.token}`
    }, options.tty || false);
    this.exitPromise = new Promise((resolve) => {
      this.exitResolver = resolve;
    });
    this.setupStreams();
  }
  /**
   * Start the command execution
   */
  async start() {
    if (this.started) {
      throw new Error("Command already started");
    }
    this.started = true;
    await this.wsCmd.start();
  }
  /**
   * Set up stream connections
   */
  setupStreams() {
    this.stdin.on("data", (chunk) => {
      try {
        this.wsCmd.writeStdin(chunk);
      } catch (error) {
        this.emit("error", error);
      }
    });
    this.stdin.on("end", () => {
      this.wsCmd.sendStdinEOF();
    });
    this.wsCmd.on("stdout", (data) => {
      this.stdout.push(data);
    });
    this.wsCmd.on("stderr", (data) => {
      this.stderr.push(data);
    });
    this.wsCmd.on("exit", (code) => {
      this.stdout.push(null);
      this.stderr.push(null);
      this.exitResolver(code);
      this.emit("exit", code);
    });
    this.wsCmd.on("error", (error) => {
      this.emit("error", error);
    });
    this.wsCmd.on("message", (msg) => {
      this.emit("message", msg);
    });
  }
  /**
   * Build WebSocket URL with query parameters
   */
  buildWebSocketURL(command, args, options) {
    let baseURL = this.sprite.client.baseURL;
    if (baseURL.startsWith("http")) {
      baseURL = "ws" + baseURL.substring(4);
    }
    const url = new URL(`${baseURL}/v1/sprites/${this.sprite.name}/exec`);
    const allArgs = [command, ...args];
    allArgs.forEach((arg) => {
      url.searchParams.append("cmd", arg);
    });
    url.searchParams.set("path", command);
    url.searchParams.set("stdin", "true");
    if (options.env) {
      for (const [key, value] of Object.entries(options.env)) {
        url.searchParams.append("env", `${key}=${value}`);
      }
    }
    if (options.cwd) {
      url.searchParams.set("dir", options.cwd);
    }
    if (options.tty) {
      url.searchParams.set("tty", "true");
      if (options.rows) {
        url.searchParams.set("rows", options.rows.toString());
      }
      if (options.cols) {
        url.searchParams.set("cols", options.cols.toString());
      }
    }
    if (options.sessionId) {
      url.searchParams.set("id", options.sessionId);
    }
    if (options.detachable) {
      url.searchParams.set("detachable", "true");
    }
    if (options.controlMode) {
      url.searchParams.set("cc", "true");
    }
    return url.toString();
  }
  /**
   * Wait for the command to complete and return the exit code
   */
  async wait() {
    return this.exitPromise;
  }
  /**
   * Kill the command
   */
  kill(_signal = "SIGTERM") {
    this.wsCmd.close();
  }
  /**
   * Resize the terminal (TTY mode only)
   */
  resize(cols, rows) {
    this.wsCmd.resize(cols, rows);
  }
  /**
   * Get the exit code (returns -1 if not exited)
   */
  exitCode() {
    return this.wsCmd.getExitCode();
  }
};
function spawn(sprite, command, args = [], options = {}) {
  const cmd = new SpriteCommand(sprite, command, args, options);
  cmd.start().then(() => {
    cmd.emit("spawn");
  }).catch((error) => {
    cmd.emit("error", error);
  });
  return cmd;
}
async function exec(sprite, command, options = {}) {
  const parts = command.trim().split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);
  return execFile(sprite, cmd, args, options);
}
async function execFile(sprite, file, args = [], options = {}) {
  const encoding = options.encoding || "utf8";
  const maxBuffer = options.maxBuffer || 10 * 1024 * 1024;
  return new Promise((resolve, reject) => {
    const cmd = new SpriteCommand(sprite, file, args, options);
    const stdoutChunks = [];
    const stderrChunks = [];
    let stdoutLength = 0;
    let stderrLength = 0;
    cmd.stdout.on("data", (chunk) => {
      stdoutChunks.push(chunk);
      stdoutLength += chunk.length;
      if (stdoutLength > maxBuffer) {
        cmd.kill();
        reject(new Error(`stdout maxBuffer exceeded`));
      }
    });
    cmd.stderr.on("data", (chunk) => {
      stderrChunks.push(chunk);
      stderrLength += chunk.length;
      if (stderrLength > maxBuffer) {
        cmd.kill();
        reject(new Error(`stderr maxBuffer exceeded`));
      }
    });
    cmd.on("exit", (code) => {
      const stdoutBuffer = Buffer.concat(stdoutChunks);
      const stderrBuffer = Buffer.concat(stderrChunks);
      const result = {
        stdout: encoding === "buffer" ? stdoutBuffer : stdoutBuffer.toString(encoding),
        stderr: encoding === "buffer" ? stderrBuffer : stderrBuffer.toString(encoding),
        exitCode: code
      };
      if (code !== 0) {
        const error = new ExecError(`Command failed with exit code ${code}`, result);
        reject(error);
      } else {
        resolve(result);
      }
    });
    cmd.on("error", (error) => {
      reject(error);
    });
    cmd.start().catch(reject);
  });
}

// node_modules/@fly/sprites/dist/sprite.js
var Sprite = class {
  // Core properties
  name;
  client;
  // Additional properties from API
  id;
  organizationName;
  status;
  config;
  environment;
  createdAt;
  updatedAt;
  bucketName;
  primaryRegion;
  constructor(name, client) {
    this.name = name;
    this.client = client;
  }
  /**
   * Spawn a command on the sprite (event-based API, most Node.js-like)
   */
  spawn(command, args = [], options = {}) {
    return spawn(this, command, args, options);
  }
  /**
   * Execute a command and return a promise with the output
   */
  async exec(command, options = {}) {
    return exec(this, command, options);
  }
  /**
   * Execute a file with arguments and return a promise with the output
   */
  async execFile(file, args = [], options = {}) {
    return execFile(this, file, args, options);
  }
  /**
   * Create a detachable tmux session
   */
  createSession(command, args = [], options = {}) {
    return spawn(this, command, args, {
      ...options,
      detachable: true,
      tty: true
    });
  }
  /**
   * Attach to an existing session
   */
  attachSession(sessionId, options = {}) {
    return spawn(this, "tmux", ["attach", "-t", sessionId], {
      ...options,
      sessionId,
      tty: true
    });
  }
  /**
   * List active sessions
   */
  async listSessions() {
    const response = await fetch(`${this.client.baseURL}/v1/sprites/${this.name}/exec`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.client.token}`
      },
      signal: AbortSignal.timeout(3e4)
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to list sessions (status ${response.status}): ${body}`);
    }
    const result = await response.json();
    const sessions = [];
    if (result.sessions && Array.isArray(result.sessions)) {
      for (const s of result.sessions) {
        const session = {
          id: s.id,
          command: s.command,
          created: new Date(s.created),
          bytesPerSecond: s.bytes_per_second || 0,
          isActive: s.is_active || false
        };
        if (s.last_activity) {
          session.lastActivity = new Date(s.last_activity);
        }
        sessions.push(session);
      }
    }
    return sessions;
  }
  /**
   * Delete this sprite
   */
  async delete() {
    await this.client.deleteSprite(this.name);
  }
  /**
   * Alias for delete()
   */
  async destroy() {
    await this.delete();
  }
  /**
   * Upgrade this sprite to the latest version
   */
  async upgrade() {
    await this.client.upgradeSprite(this.name);
  }
  /**
   * Create a checkpoint with an optional comment.
   * Returns the streaming Response (NDJSON). Caller is responsible for consuming the stream.
   */
  async createCheckpoint(comment) {
    const body = {};
    if (comment)
      body.comment = comment;
    const response = await fetch(`${this.client.baseURL}/v1/sprites/${this.name}/checkpoint`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.client.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
      // No timeout: checkpoint streams can be long-running
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to create checkpoint (status ${response.status}): ${text}`);
    }
    return response;
  }
  /**
   * List checkpoints
   */
  async listCheckpoints() {
    const response = await fetch(`${this.client.baseURL}/v1/sprites/${this.name}/checkpoints`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.client.token}`
      },
      signal: AbortSignal.timeout(3e4)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to list checkpoints (status ${response.status}): ${text}`);
    }
    const raw = await response.json();
    return raw.map((cp) => ({
      id: cp.id,
      createTime: new Date(cp.create_time),
      comment: cp.comment,
      history: cp.history
    }));
  }
  /**
   * Get checkpoint details
   */
  async getCheckpoint(id) {
    const response = await fetch(`${this.client.baseURL}/v1/sprites/${this.name}/checkpoints/${id}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.client.token}`
      },
      signal: AbortSignal.timeout(3e4)
    });
    if (response.status === 404) {
      throw new Error(`Checkpoint not found: ${id}`);
    }
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to get checkpoint (status ${response.status}): ${text}`);
    }
    const cp = await response.json();
    return {
      id: cp.id,
      createTime: new Date(cp.create_time),
      comment: cp.comment,
      history: cp.history
    };
  }
  /**
   * Restore from a checkpoint. Returns the streaming Response (NDJSON).
   */
  async restoreCheckpoint(id) {
    const response = await fetch(`${this.client.baseURL}/v1/sprites/${this.name}/checkpoints/${id}/restore`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.client.token}`
      }
      // No timeout: restore streams can be long-running
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Failed to restore checkpoint (status ${response.status}): ${text}`);
    }
    return response;
  }
};

// node_modules/@fly/sprites/dist/client.js
var SpritesClient = class {
  baseURL;
  token;
  timeout;
  constructor(token, options = {}) {
    this.token = token;
    this.baseURL = (options.baseURL || "https://api.sprites.dev").replace(/\/+$/, "");
    this.timeout = options.timeout || 3e4;
  }
  /**
   * Get a handle to a sprite (doesn't create it on the server)
   */
  sprite(name) {
    return new Sprite(name, this);
  }
  /**
   * Create a new sprite
   */
  async createSprite(name, config) {
    const request = { name, config };
    const response = await this.fetch(`${this.baseURL}/v1/sprites`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(12e4)
      // 2 minute timeout for creation
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to create sprite (status ${response.status}): ${body}`);
    }
    const result = await response.json();
    return new Sprite(result.name, this);
  }
  /**
   * Get information about a sprite
   */
  async getSprite(name) {
    const response = await this.fetch(`${this.baseURL}/v1/sprites/${name}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.token}`
      },
      signal: AbortSignal.timeout(this.timeout)
    });
    if (response.status === 404) {
      throw new Error(`Sprite not found: ${name}`);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to get sprite (status ${response.status}): ${body}`);
    }
    const info = await response.json();
    const sprite = new Sprite(info.name, this);
    Object.assign(sprite, info);
    return sprite;
  }
  /**
   * List sprites with optional filtering and pagination
   */
  async listSprites(options = {}) {
    const params = new URLSearchParams();
    if (options.maxResults)
      params.set("max_results", options.maxResults.toString());
    if (options.continuationToken)
      params.set("continuation_token", options.continuationToken);
    if (options.prefix)
      params.set("prefix", options.prefix);
    const url = `${this.baseURL}/v1/sprites?${params}`;
    const response = await this.fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${this.token}`
      },
      signal: AbortSignal.timeout(this.timeout)
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Failed to list sprites (status ${response.status}): ${body}`);
    }
    return await response.json();
  }
  /**
   * List all sprites, handling pagination automatically
   */
  async listAllSprites(prefix) {
    const allSprites = [];
    let continuationToken;
    do {
      const result = await this.listSprites({
        prefix,
        maxResults: 100,
        continuationToken
      });
      for (const info of result.sprites) {
        const sprite = new Sprite(info.name, this);
        Object.assign(sprite, info);
        allSprites.push(sprite);
      }
      continuationToken = result.hasMore ? result.nextContinuationToken : void 0;
    } while (continuationToken);
    return allSprites;
  }
  /**
   * Delete a sprite
   */
  async deleteSprite(name) {
    const response = await this.fetch(`${this.baseURL}/v1/sprites/${name}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${this.token}`
      },
      signal: AbortSignal.timeout(this.timeout)
    });
    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      throw new Error(`Failed to delete sprite (status ${response.status}): ${body}`);
    }
  }
  /**
   * Upgrade a sprite to the latest version
   */
  async upgradeSprite(name) {
    const response = await this.fetch(`${this.baseURL}/v1/sprites/${name}/upgrade`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.token}`
      },
      signal: AbortSignal.timeout(6e4)
    });
    if (!response.ok && response.status !== 204) {
      const body = await response.text();
      throw new Error(`Failed to upgrade sprite (status ${response.status}): ${body}`);
    }
  }
  /**
   * Create a sprite access token using a Fly.io macaroon token
   */
  static async createToken(flyMacaroon, orgSlug, inviteCode) {
    const apiURL = "https://api.sprites.dev";
    const url = `${apiURL}/v1/organizations/${orgSlug}/tokens`;
    const body = {
      description: "Sprite SDK Token"
    };
    if (inviteCode) {
      body.invite_code = inviteCode;
    }
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `FlyV1 ${flyMacaroon}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3e4)
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`API returned status ${response.status}: ${text}`);
    }
    const result = await response.json();
    if (!result.token) {
      throw new Error("No token returned in response");
    }
    return result.token;
  }
  /**
   * Wrapper around fetch for consistent error handling
   */
  async fetch(url, init) {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Network error: ${error.message}`);
      }
      throw error;
    }
  }
};

// src/spriteFileSystem.ts
var vscode = __toESM(require("vscode"));
var SpriteFileSystemProvider = class {
  constructor() {
    this.client = null;
    this.spriteCache = /* @__PURE__ */ new Map();
    this.clientReadyPromise = null;
    this.clientReadyResolve = null;
    this._emitter = new vscode.EventEmitter();
    this.onDidChangeFile = this._emitter.event;
    this.clientReadyPromise = new Promise((resolve) => {
      this.clientReadyResolve = resolve;
    });
  }
  setClient(client) {
    this.client = client;
    this.spriteCache.clear();
    if (this.clientReadyResolve) {
      this.clientReadyResolve();
      this.clientReadyResolve = null;
    }
  }
  // Wait for client to be ready (with timeout)
  async waitForClient(timeoutMs = 5e3) {
    if (this.client) return true;
    if (!this.clientReadyPromise) return false;
    const timeout = new Promise(
      (resolve) => setTimeout(() => resolve(false), timeoutMs)
    );
    const ready = this.clientReadyPromise.then(() => true);
    return Promise.race([ready, timeout]);
  }
  getSprite(spriteName) {
    if (!this.client) {
      return null;
    }
    let sprite = this.spriteCache.get(spriteName);
    if (!sprite) {
      sprite = this.client.sprite(spriteName);
      this.spriteCache.set(spriteName, sprite);
    }
    return sprite;
  }
  parseUri(uri) {
    const spriteName = uri.authority;
    const path2 = uri.path || "/";
    return { spriteName, path: path2 };
  }
  // Execute command using spawn (more reliable than exec)
  async safeExec(sprite, command) {
    return new Promise((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      const proc = sprite.spawn("bash", ["-c", command], { tty: false });
      proc.stdout?.on("data", (data) => {
        stdout += data.toString();
      });
      proc.stderr?.on("data", (data) => {
        stderr += data.toString();
      });
      proc.on("exit", (code) => {
        resolve({ stdout, stderr, exitCode: code || 0 });
      });
      proc.on("error", (err) => {
        reject(err);
      });
      setTimeout(() => {
        proc.kill();
        resolve({ stdout, stderr, exitCode: 124 });
      }, 3e4);
    });
  }
  watch(_uri) {
    return new vscode.Disposable(() => {
    });
  }
  async stat(uri) {
    const { spriteName, path: path2 } = this.parseUri(uri);
    if (!this.client) {
      await this.waitForClient();
    }
    const sprite = this.getSprite(spriteName);
    if (!sprite) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    try {
      const result = await this.safeExec(
        sprite,
        `if [ -e "${path2}" ]; then stat -c '%F|%s|%Y|%X' "${path2}"; else echo "NOTFOUND"; fi`
      );
      const output = result.stdout.trim();
      if (output === "NOTFOUND" || !output) {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      const [typeStr, sizeStr, mtimeStr, ctimeStr] = output.split("|");
      const size = parseInt(sizeStr, 10) || 0;
      const mtime = parseInt(mtimeStr, 10) * 1e3 || Date.now();
      const ctime = parseInt(ctimeStr, 10) * 1e3 || Date.now();
      let type = vscode.FileType.Unknown;
      if (typeStr.includes("directory")) {
        type = vscode.FileType.Directory;
      } else if (typeStr.includes("regular") || typeStr.includes("file")) {
        type = vscode.FileType.File;
      } else if (typeStr.includes("symbolic link")) {
        type = vscode.FileType.SymbolicLink;
      }
      return { type, ctime, mtime, size };
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        throw error;
      }
      throw vscode.FileSystemError.Unavailable(`Failed to stat ${path2}: ${error.message}`);
    }
  }
  async readDirectory(uri) {
    const { spriteName, path: path2 } = this.parseUri(uri);
    if (!this.client) {
      await this.waitForClient();
    }
    const sprite = this.getSprite(spriteName);
    if (!sprite) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    try {
      const result = await this.safeExec(sprite, `ls -1Ap "${path2}" 2>/dev/null || true`);
      const output = result.stdout.trim();
      if (!output) {
        return [];
      }
      const entries = [];
      for (const line of output.split("\n")) {
        if (!line) continue;
        let name = line;
        let type = vscode.FileType.File;
        if (name.endsWith("/")) {
          name = name.slice(0, -1);
          type = vscode.FileType.Directory;
        } else if (name.endsWith("@")) {
          name = name.slice(0, -1);
          type = vscode.FileType.SymbolicLink;
        } else if (name.endsWith("*")) {
          name = name.slice(0, -1);
          type = vscode.FileType.File;
        } else if (name.endsWith("|") || name.endsWith("=")) {
          name = name.slice(0, -1);
          type = vscode.FileType.File;
        }
        if (name && name !== "." && name !== "..") {
          entries.push([name, type]);
        }
      }
      return entries;
    } catch (error) {
      console.error(`readDirectory failed for ${uri.toString()}:`, error);
      throw vscode.FileSystemError.Unavailable(`Failed to list ${path2}: ${error.message}`);
    }
  }
  async readFile(uri) {
    const { spriteName, path: path2 } = this.parseUri(uri);
    if (!this.client) {
      await this.waitForClient();
    }
    const sprite = this.getSprite(spriteName);
    if (!sprite) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    try {
      const result = await this.safeExec(
        sprite,
        `if [ -f "${path2}" ]; then base64 "${path2}"; elif [ -e "${path2}" ]; then echo "ISDIR"; else echo "NOTFOUND"; fi`
      );
      const output = result.stdout.trim();
      if (output === "NOTFOUND") {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      if (output === "ISDIR") {
        throw vscode.FileSystemError.FileIsADirectory(uri);
      }
      const base64Content = output.replace(/\s/g, "");
      if (!base64Content) {
        return new Uint8Array(0);
      }
      const binaryString = atob(base64Content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        throw error;
      }
      console.error(`readFile failed for ${uri.toString()}:`, error);
      throw vscode.FileSystemError.Unavailable(`Failed to read ${path2}: ${error.message}`);
    }
  }
  async writeFile(uri, content, options) {
    const { spriteName, path: path2 } = this.parseUri(uri);
    const sprite = this.getSprite(spriteName);
    if (!sprite) {
      throw vscode.FileSystemError.Unavailable("Not connected to Sprites API");
    }
    try {
      const parentDir = path2.substring(0, path2.lastIndexOf("/")) || "/";
      const base64Content = Buffer.from(content).toString("base64");
      const script = `
                exists=0; [ -e "${path2}" ] && exists=1
                if [ $exists -eq 1 ] && [ "${options.overwrite ? "1" : "0"}" = "0" ]; then
                    echo "EXISTS"; exit 1
                fi
                if [ $exists -eq 0 ] && [ "${options.create ? "1" : "0"}" = "0" ]; then
                    echo "NOTFOUND"; exit 1
                fi
                mkdir -p "${parentDir}" && echo "${base64Content}" | base64 -d > "${path2}" && echo "OK:$exists"
            `;
      const result = await this.safeExec(sprite, script);
      const output = result.stdout.trim();
      if (output === "EXISTS") {
        throw vscode.FileSystemError.FileExists(uri);
      }
      if (output === "NOTFOUND") {
        throw vscode.FileSystemError.FileNotFound(uri);
      }
      if (!output.startsWith("OK:")) {
        throw new Error(result.stderr || "Write failed");
      }
      const existed = output === "OK:1";
      this._emitter.fire([{
        type: existed ? vscode.FileChangeType.Changed : vscode.FileChangeType.Created,
        uri
      }]);
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        throw error;
      }
      console.error(`writeFile failed for ${uri.toString()}:`, error);
      throw vscode.FileSystemError.Unavailable(`Failed to write ${path2}: ${error.message}`);
    }
  }
  async createDirectory(uri) {
    const { spriteName, path: path2 } = this.parseUri(uri);
    const sprite = this.getSprite(spriteName);
    if (!sprite) {
      throw vscode.FileSystemError.Unavailable("Not connected to Sprites API");
    }
    try {
      const result = await this.safeExec(sprite, `mkdir -p "${path2}"`);
      if (result.exitCode !== 0) {
        throw new Error(result.stderr || "mkdir failed");
      }
      this._emitter.fire([{ type: vscode.FileChangeType.Created, uri }]);
    } catch (error) {
      console.error(`createDirectory failed for ${uri.toString()}:`, error);
      throw vscode.FileSystemError.Unavailable(`Failed to create ${path2}: ${error.message}`);
    }
  }
  async delete(uri, options) {
    const { spriteName, path: path2 } = this.parseUri(uri);
    const sprite = this.getSprite(spriteName);
    if (!sprite) {
      throw vscode.FileSystemError.Unavailable("Not connected to Sprites API");
    }
    try {
      const flags = options.recursive ? "-rf" : "-f";
      await this.safeExec(sprite, `rm ${flags} "${path2}"`);
      this._emitter.fire([{ type: vscode.FileChangeType.Deleted, uri }]);
    } catch (error) {
      console.error(`delete failed for ${uri.toString()}:`, error);
      throw vscode.FileSystemError.Unavailable(`Failed to delete ${path2}: ${error.message}`);
    }
  }
  async rename(oldUri, newUri, options) {
    const { spriteName: oldSprite, path: oldPath } = this.parseUri(oldUri);
    const { spriteName: newSprite, path: newPath } = this.parseUri(newUri);
    if (oldSprite !== newSprite) {
      throw vscode.FileSystemError.NoPermissions("Cannot move files between different Sprites");
    }
    const sprite = this.getSprite(oldSprite);
    if (!sprite) {
      throw vscode.FileSystemError.Unavailable("Not connected to Sprites API");
    }
    try {
      const script = options.overwrite ? `mv "${oldPath}" "${newPath}" && echo OK` : `if [ -e "${newPath}" ]; then echo EXISTS; else mv "${oldPath}" "${newPath}" && echo OK; fi`;
      const result = await this.safeExec(sprite, script);
      const output = result.stdout.trim();
      if (output === "EXISTS") {
        throw vscode.FileSystemError.FileExists(newUri);
      }
      if (output !== "OK") {
        throw new Error(result.stderr || "Move failed");
      }
      this._emitter.fire([
        { type: vscode.FileChangeType.Deleted, uri: oldUri },
        { type: vscode.FileChangeType.Created, uri: newUri }
      ]);
    } catch (error) {
      if (error instanceof vscode.FileSystemError) {
        throw error;
      }
      console.error(`rename failed:`, error);
      throw vscode.FileSystemError.Unavailable(`Failed to rename: ${error.message}`);
    }
  }
};

// src/extension.ts
var globalClient = null;
var spriteFs = new SpriteFileSystemProvider();
var initPromise = null;
async function tryReadCliToken() {
  return new Promise((resolve) => {
    (0, import_child_process.execFile)("sprite", ["api", "/v1/sprites", "-v"], {
      timeout: 15e3,
      env: { ...process.env }
    }, (error, stdout, stderr) => {
      const combined = (stderr || "") + (stdout || "");
      const match = combined.match(/Authorization:\s*Bearer\s+(\S+)/i);
      if (match && match[1]) {
        resolve(match[1]);
      } else {
        resolve(null);
      }
    });
  });
}
async function initClient(token) {
  try {
    const client = new SpritesClient(token);
    await client.listAllSprites();
    globalClient = client;
    spriteFs.setClient(client);
    return true;
  } catch {
    return false;
  }
}
async function ensureClient() {
  if (globalClient) {
    return true;
  }
  if (initPromise) {
    await initPromise;
  }
  return globalClient !== null;
}
function activate(context) {
  console.log("Sprite extension is now active");
  context.subscriptions.push(
    vscode2.workspace.registerFileSystemProvider("sprite", spriteFs, {
      isCaseSensitive: true,
      isReadonly: false
    })
  );
  initPromise = (async () => {
    const savedToken = await context.secrets.get("spriteToken");
    if (savedToken) {
      const valid = await initClient(savedToken);
      if (valid) {
        console.log("Sprite: Token restored from secrets");
        return;
      }
      console.warn("Sprite: Saved token is invalid or expired");
    }
    if (!globalClient) {
      const cliToken = await tryReadCliToken();
      if (cliToken) {
        const valid = await initClient(cliToken);
        if (valid) {
          await context.secrets.store("spriteToken", cliToken);
          console.log("Sprite: Token restored from CLI");
          return;
        }
      }
    }
    if (savedToken && !globalClient) {
      const action = await vscode2.window.showWarningMessage(
        "Sprite: Saved API token is invalid or expired",
        "Set New Token"
      );
      if (action === "Set New Token") {
        vscode2.commands.executeCommand("sprite.setToken");
      }
    }
  })();
  const folders = vscode2.workspace.workspaceFolders;
  if (folders?.length === 1 && folders[0].uri.scheme === "sprite") {
    initPromise.then(() => {
      if (globalClient) {
        vscode2.commands.executeCommand("sprite.openTerminal");
      }
    });
  }
  const setToken = vscode2.commands.registerCommand("sprite.setToken", async () => {
    const token = await vscode2.window.showInputBox({
      prompt: "Enter your Sprites.dev API token",
      password: true,
      ignoreFocusOut: true
    });
    if (token) {
      await context.secrets.store("spriteToken", token);
      const valid = await initClient(token);
      if (valid) {
        vscode2.window.showInformationMessage("Sprite API token saved");
      } else {
        vscode2.window.showErrorMessage("Sprite: Token is invalid. Please check your token and try again.");
      }
    }
  });
  const openSprite = vscode2.commands.registerCommand("sprite.openSprite", async () => {
    const ready = await vscode2.window.withProgress({
      location: vscode2.ProgressLocation.Notification,
      title: "Sprite: Connecting..."
    }, () => ensureClient());
    if (!ready) {
      const setNow = await vscode2.window.showErrorMessage(
        "Sprite: No API token found. Set one or authenticate with the Sprite CLI.",
        "Set Token"
      );
      if (setNow === "Set Token") {
        vscode2.commands.executeCommand("sprite.setToken");
      }
      return;
    }
    try {
      const sprites = await globalClient.listAllSprites();
      if (sprites.length === 0) {
        const create = await vscode2.window.showInformationMessage(
          "No sprites found. Create one?",
          "Create Sprite"
        );
        if (create === "Create Sprite") {
          vscode2.commands.executeCommand("sprite.createSprite");
        }
        return;
      }
      const items = sprites.map((s) => ({
        label: s.name,
        description: s.status || "",
        sprite: s
      }));
      const selected = await vscode2.window.showQuickPick(items, {
        placeHolder: "Select a Sprite to open"
      });
      if (!selected) {
        return;
      }
      const pathInput = await vscode2.window.showInputBox({
        prompt: "Enter path to open",
        value: "/home/sprite",
        ignoreFocusOut: true
      });
      if (!pathInput) {
        return;
      }
      const uri = vscode2.Uri.parse(`sprite://${selected.sprite.name}${pathInput}`);
      await vscode2.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: true });
    } catch (error) {
      vscode2.window.showErrorMessage(`Error: ${error.message}`);
    }
  });
  const createSprite = vscode2.commands.registerCommand("sprite.createSprite", async () => {
    const ready = await ensureClient();
    if (!ready) {
      vscode2.window.showErrorMessage('Sprite: No API token. Use "Sprites: Set API Token" first.');
      return;
    }
    const name = await vscode2.window.showInputBox({
      prompt: "Enter sprite name",
      placeHolder: "my-sprite"
    });
    if (!name) {
      return;
    }
    try {
      await vscode2.window.withProgress({
        location: vscode2.ProgressLocation.Notification,
        title: `Creating sprite: ${name}`,
        cancellable: false
      }, async () => {
        await globalClient.createSprite(name);
      });
      const open = await vscode2.window.showInformationMessage(
        `Sprite '${name}' created successfully`,
        "Open Sprite"
      );
      if (open === "Open Sprite") {
        const uri = vscode2.Uri.parse(`sprite://${name}/home/sprite`);
        await vscode2.commands.executeCommand("vscode.openFolder", uri, { forceNewWindow: true });
      }
    } catch (error) {
      vscode2.window.showErrorMessage(`Error creating sprite: ${error.message}`);
    }
  });
  const openTerminal = vscode2.commands.registerCommand("sprite.openTerminal", async () => {
    const ready = await ensureClient();
    if (!ready) {
      vscode2.window.showErrorMessage('Sprite: No API token. Use "Sprites: Set API Token" first.');
      return;
    }
    let spriteName;
    const workspaceFolders = vscode2.workspace.workspaceFolders;
    if (workspaceFolders?.length === 1 && workspaceFolders[0].uri.scheme === "sprite") {
      spriteName = workspaceFolders[0].uri.authority;
    }
    if (!spriteName) {
      const activeUri = vscode2.window.activeTextEditor?.document.uri;
      if (activeUri?.scheme === "sprite") {
        spriteName = activeUri.authority;
      }
    }
    if (!spriteName) {
      const sprites = await globalClient.listAllSprites();
      if (sprites.length === 0) {
        vscode2.window.showInformationMessage("No sprites found");
        return;
      }
      const items = sprites.map((s) => ({ label: s.name, sprite: s }));
      const selected = await vscode2.window.showQuickPick(items, {
        placeHolder: "Select sprite for terminal"
      });
      if (!selected) {
        return;
      }
      spriteName = selected.sprite.name;
    }
    const sprite = globalClient.sprite(spriteName);
    const writeEmitter = new vscode2.EventEmitter();
    let shellCmd;
    const pty = {
      onDidWrite: writeEmitter.event,
      open: async (initialDimensions) => {
        writeEmitter.fire(`Connecting to sprite: ${spriteName}\r
`);
        try {
          shellCmd = sprite.spawn("bash", ["-l"], {
            tty: true,
            rows: initialDimensions?.rows || 24,
            cols: initialDimensions?.columns || 80
          });
          shellCmd.stdout?.on("data", (data) => {
            writeEmitter.fire(data.toString());
          });
          shellCmd.stderr?.on("data", (data) => {
            writeEmitter.fire(data.toString());
          });
          shellCmd.on("exit", () => {
            writeEmitter.fire("\r\n[Disconnected]\r\n");
          });
        } catch (error) {
          writeEmitter.fire(`\r
Error: ${error.message}\r
`);
        }
      },
      close: () => {
        if (shellCmd) {
          shellCmd.kill();
        }
      },
      handleInput: (data) => {
        if (shellCmd?.stdin) {
          shellCmd.stdin.write(data);
        }
      },
      setDimensions: (dimensions) => {
        if (shellCmd) {
          shellCmd.resize(dimensions.columns, dimensions.rows);
        }
      }
    };
    const terminal = vscode2.window.createTerminal({
      name: `Sprite: ${spriteName}`,
      pty
    });
    terminal.show();
  });
  const deleteSprite = vscode2.commands.registerCommand("sprite.deleteSprite", async () => {
    const ready = await ensureClient();
    if (!ready) {
      vscode2.window.showErrorMessage('Sprite: No API token. Use "Sprites: Set API Token" first.');
      return;
    }
    try {
      const sprites = await globalClient.listAllSprites();
      if (sprites.length === 0) {
        vscode2.window.showInformationMessage("No sprites found");
        return;
      }
      const items = sprites.map((s) => ({ label: s.name, sprite: s }));
      const selected = await vscode2.window.showQuickPick(items, {
        placeHolder: "Select sprite to delete"
      });
      if (!selected) {
        return;
      }
      const confirm = await vscode2.window.showWarningMessage(
        `Delete sprite '${selected.sprite.name}'? This cannot be undone.`,
        { modal: true },
        "Delete"
      );
      if (confirm === "Delete") {
        await globalClient.deleteSprite(selected.sprite.name);
        vscode2.window.showInformationMessage(`Sprite '${selected.sprite.name}' deleted`);
        const currentFolders = vscode2.workspace.workspaceFolders;
        if (currentFolders?.length === 1 && currentFolders[0].uri.scheme === "sprite" && currentFolders[0].uri.authority === selected.sprite.name) {
          vscode2.commands.executeCommand("workbench.action.closeWindow");
        }
      }
    } catch (error) {
      vscode2.window.showErrorMessage(`Error: ${error.message}`);
    }
  });
  const refreshSprite = vscode2.commands.registerCommand("sprite.refresh", async () => {
    vscode2.commands.executeCommand("workbench.files.action.refreshFilesExplorer");
  });
  const downloadToLocal = vscode2.commands.registerCommand("sprite.downloadToLocal", async (uri) => {
    if (!uri) {
      uri = vscode2.window.activeTextEditor?.document.uri;
    }
    if (!uri || uri.scheme !== "sprite") {
      vscode2.window.showErrorMessage("Please select a file or folder from a Sprite");
      return;
    }
    const isDirectory = (await vscode2.workspace.fs.stat(uri)).type === vscode2.FileType.Directory;
    let targetPath;
    if (isDirectory) {
      const folders2 = await vscode2.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select Download Location"
      });
      if (folders2 && folders2.length > 0) {
        const folderName = path.basename(uri.path);
        targetPath = vscode2.Uri.joinPath(folders2[0], folderName);
      }
    } else {
      const fileName = path.basename(uri.path);
      targetPath = await vscode2.window.showSaveDialog({
        defaultUri: vscode2.Uri.file(path.join(os.homedir(), "Downloads", fileName)),
        saveLabel: "Download"
      });
    }
    if (!targetPath) {
      return;
    }
    await vscode2.window.withProgress({
      location: vscode2.ProgressLocation.Notification,
      title: `Downloading ${path.basename(uri.path)}`,
      cancellable: false
    }, async (progress) => {
      try {
        if (isDirectory) {
          await downloadDirectory(uri, targetPath);
        } else {
          const content = await vscode2.workspace.fs.readFile(uri);
          await fs.promises.mkdir(path.dirname(targetPath.fsPath), { recursive: true });
          await fs.promises.writeFile(targetPath.fsPath, content);
        }
        vscode2.window.showInformationMessage(`Downloaded to ${targetPath.fsPath}`);
      } catch (error) {
        vscode2.window.showErrorMessage(`Download failed: ${error.message}`);
      }
    });
  });
  async function downloadDirectory(sourceUri, targetUri) {
    await fs.promises.mkdir(targetUri.fsPath, { recursive: true });
    const entries = await vscode2.workspace.fs.readDirectory(sourceUri);
    for (const [name, type] of entries) {
      const sourceChild = vscode2.Uri.joinPath(sourceUri, name);
      const targetChild = vscode2.Uri.joinPath(targetUri, name);
      if (type === vscode2.FileType.Directory) {
        await downloadDirectory(sourceChild, targetChild);
      } else {
        const content = await vscode2.workspace.fs.readFile(sourceChild);
        await fs.promises.writeFile(targetChild.fsPath, content);
      }
    }
  }
  context.subscriptions.push(
    setToken,
    openSprite,
    createSprite,
    openTerminal,
    deleteSprite,
    refreshSprite,
    downloadToLocal
  );
}
function deactivate() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  activate,
  deactivate
});
