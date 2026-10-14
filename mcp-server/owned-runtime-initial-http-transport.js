"use strict";

// Version-pinned private bridge between native original SOCKET ownership and
// Node's existing HTTP parser. This module never opens a JavaScript listener.
const {Duplex} = require("node:stream");
const httpInternals = require("node:_http_server");
const native = require("./owned-runtime-initial-native-client");
const transportKey = Object.freeze(Object.create(null));
const streams = new WeakMap(), requests = new WeakMap(), servers = new WeakMap();
const MAX_CHUNK = 65536, MAX_RESPONSE = 1048576;
function fail(code) { throw Object.assign(Error(code), {code}); }
function runtime() {
  if (process.version !== "v24.19.0" || process.platform !== "win32" || process.arch !== "x64" ||
      typeof httpInternals.setupConnectionsTracking !== "function" ||
      typeof httpInternals.httpServerPreClose !== "function" || typeof httpInternals._connectionListener !== "function")
    fail("owned_initial_http_parser_profile_refused");
}
class NativeDuplex extends Duplex {
  constructor(key, role, connection) {
    if (key !== transportKey) fail("owned_initial_private_stream_required");
    super({allowHalfOpen:true, readableHighWaterMark:MAX_CHUNK, writableHighWaterMark:MAX_CHUNK, autoDestroy:true});
    const state = {role, connection, reading:false, readingAgain:false, timeout:0, timer:null, closed:false, writing:false,writePromise:null,writeError:null};
    streams.set(this, state);
    native.brandHttpStream(role, connection, this);
    const peer = native.connectionPeer(role, connection);
    for (const [name,value] of Object.entries({remoteAddress:peer.remoteAddress,remotePort:peer.remotePort,
      localAddress:peer.localAddress,localPort:peer.localPort,remoteFamily:"IPv4",localFamily:"IPv4"}))
      Object.defineProperty(this, name, {value,enumerable:true,writable:false,configurable:false});
    this._paused = false;
  }
  _unrefTimer() { const s=streams.get(this);if (s.timer) {s.timer.refresh();s.timer.unref();} }
  setTimeout(milliseconds, callback) {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 0 || milliseconds > 2147483647) fail("owned_initial_socket_timeout_shape");
    const s=streams.get(this);if (s.timer) clearTimeout(s.timer);s.timer=null;s.timeout=milliseconds;
    if (callback !== undefined) {if (typeof callback !== "function") fail("owned_initial_socket_timeout_callback");this.once("timeout",callback);}
    if (milliseconds && !s.closed) {s.timer=setTimeout(()=>{s.timer=null;if (!s.closed) this.emit("timeout");},milliseconds);s.timer.unref();}
    return this;
  }
  _read() {
    const s=streams.get(this);if (s.closed) return;if (s.reading) {s.readingAgain=true;return;}s.reading=true;
    const read=async()=>{try {for (;;) {
      if (s.closed || this.destroyed || native.readRevokedKnown(s.role)) return;
      let bytes;try {bytes=await native.connectionRead(s.role,s.connection);}catch(error) {
        if (error.code === "trusted_socket_timeout" && !s.closed) continue;throw error;
      }
      native.assertCurrent(s.role);if (s.closed) return;
      if (!Buffer.isBuffer(bytes) || bytes.length > MAX_CHUNK) fail("owned_initial_socket_read_shape");
      if (!bytes.length) {this.push(null);return;}this._unrefTimer();
      if (!this.push(bytes)) return;
    }}catch(error) {this.destroy(error);}finally {s.reading=false;if (s.readingAgain && !s.closed) {s.readingAgain=false;this._read();}}};
    void read();
  }
  _write(chunk, encoding, callback) {
    const s=streams.get(this);if (s.closed) return callback(Object.assign(Error("owned_initial_socket_closed"),{code:"owned_initial_socket_closed"}));
    const bytes=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk,encoding);
    const write=async()=>{s.writing=true;try {for (let at=0;at<bytes.length;at+=MAX_CHUNK) {
      if (s.closed || native.readRevokedKnown(s.role)) fail("owned_initial_http_read_revoked_known");
      await native.connectionWrite(s.role,s.connection,bytes.subarray(at,at+MAX_CHUNK));native.assertCurrent(s.role);
    }this._unrefTimer();callback();}catch(error){s.writeError=error;callback(error);}finally{s.writing=false;}};
    // Retain the one already consumed write outcome. Parser error handling writes
    // 400/408/431 and immediately destroys; closing its original SOCKET before
    // this bounded native write settles would discard the actual error response.
    s.writePromise=write();void s.writePromise;
  }
  _final(callback) { const s=streams.get(this);void native.connectionEnd(s.role,s.connection).then(()=>callback(),callback); }
  _destroy(error, callback) { const s=streams.get(this);s.closed=true;if (s.timer) clearTimeout(s.timer);s.timer=null;
    const consumedWrite=s.writePromise;
    const close=async()=>{if (consumedWrite) await consumedWrite;await native.connectionClose(s.role,s.connection);};
    void close().then(()=>callback(error||s.writeError),failure=>callback(error||s.writeError||failure)); }
  destroySoon() { if (this.writableFinished) this.destroy();else this.end(()=>this.destroy());return this; }
}
async function bindFixedServer(role, server) {
  runtime();native.assertCurrent(role);
  if (servers.has(server) || server.listening || server._handle || server.listenerCount("connection") !== 1 ||
      server.listeners("connection")[0] !== httpInternals._connectionListener)
    fail("owned_initial_http_server_shape_refused");
  const listener=await native.openHttpListenerFixed(role);native.assertCurrent(role);
  const state={role,listener,closed:false,sockets:new Set(),pending:new Set(),closePromise:null};servers.set(server,state);
  // Node's default socketOnEnd closes the writable side immediately, even when
  // an async request handler is still validating its complete body. The pinned
  // half-open path marks the last actual response and closes after it finishes.
  server.httpAllowHalfOpen=true;
  httpInternals.setupConnectionsTracking.call(server);
  server.prependListener("request",(req,res)=>{
    const socketState=streams.get(req.socket);if (!socketState || socketState.role!==role || state.closed || requests.has(req)) {
      req.destroy(Object.assign(Error("owned_initial_foreign_http_request"),{code:"owned_initial_foreign_http_request"}));return;
    }
    const item={role,connection:socketState.connection,req,res,authenticated:null,finished:false,response:[],responseBytes:0};requests.set(req,item);
    const originalWrite=res.write,originalEnd=res.end;
    function retain(chunk,encoding) {if (chunk===undefined || chunk===null) return;const bytes=Buffer.isBuffer(chunk)?Buffer.from(chunk):Buffer.from(chunk,typeof encoding==="string"?encoding:undefined);
      if (item.responseBytes+bytes.length>MAX_RESPONSE) fail("owned_initial_response_limit");item.responseBytes+=bytes.length;item.response.push(bytes);}
    res.write=function(chunk,encoding,callback){retain(chunk,encoding);return Reflect.apply(originalWrite,this,[chunk,encoding,callback]);};
    res.end=function(chunk,encoding,callback){retain(chunk,encoding);return Reflect.apply(originalEnd,this,[chunk,encoding,callback]);};
    res.once("finish",()=>{item.finished=true;if (item.authenticated) {
      const completion=Promise.resolve().then(()=>native.completeAuthenticatedResponse(role,item.authenticated,res.statusCode,Buffer.concat(item.response)));
      state.pending.add(completion);void completion.catch(error=>req.socket.destroy(error)).finally(()=>state.pending.delete(completion));
    }});
    res.once("close",()=>{if (!item.finished && item.authenticated) void Promise.resolve().then(()=>native.failAuthenticatedResponse(role,item.authenticated)).catch(error=>req.socket.destroy(error));});
  });
  const accept=async()=>{while (!state.closed) {let connection;
    try {connection=await native.acceptFixed(role,listener);}catch(error) {if (error.code==="trusted_socket_timeout" && !state.closed && !native.readRevokedKnown(role)) continue;
      if (native.readRevokedKnown(role) && error.unknown!==true) break;
      if (!state.closed) server.emit("error",error);break;}
    if (state.closed || native.readRevokedKnown(role)) {await native.connectionClose(role,connection);break;}native.assertCurrent(role);
    const socket=new NativeDuplex(transportKey,role,connection);state.sockets.add(socket);socket.once("close",()=>state.sockets.delete(socket));
    // Exact pinned parser listener; no synthetic listening/address/handle state.
    Reflect.apply(httpInternals._connectionListener,server,[socket]);
  }};state.acceptPromise=accept();return Object.freeze({close:()=>closeFixedServer(server)});
}
async function retainAuthenticatedRequest(role, req, body) {
  const item=requests.get(req);if (!item || item.role!==role || item.authenticated || item.finished || req.aborted ||
      req.complete!==true || !req.socket || req.socket.destroyed)
    fail("owned_initial_original_http_request_required");
  // The producer calls this only after the unchanged authentication, Host,
  // Origin, bounded body and exact route/schema checks. Native checks the own
  // accepted object again and brands the actual req reference, once per request.
  item.authenticated=await native.retainAuthenticatedRequest(role,item.connection,req,body);
  native.assertCurrent(role);return item.authenticated;
}
function requestCapability(role, req) {const item=requests.get(req);if (!item || item.role!==role || !item.authenticated)
  fail("owned_initial_authenticated_request_required");return item.authenticated;}
function closeFixedServer(server) {
  const state=servers.get(server);if (!state) fail("owned_initial_original_server_required");if (state.closePromise) return state.closePromise;
  state.closed=true;httpInternals.httpServerPreClose(server);for (const socket of state.sockets) socket.destroy();
  state.closePromise=(async()=>{await native.closeHttpListenerFixed(state.role,state.listener);await state.acceptPromise;await Promise.allSettled([...state.pending]);server.emit("close");})();
  // A deterministic no-B33 refusal attempted no close. Keep originals and let
  // the disposition controller explicitly call again after its exact transfer.
  void state.closePromise.catch(error=>{if(error.unknown!==true&&native.readRevokedKnown(state.role)&&
    error.code==="trusted_original_listener_cleanup_pending")state.closePromise=null;});return state.closePromise;
}
module.exports=Object.freeze({bindFixedServer,retainAuthenticatedRequest,requestCapability,closeFixedServer});
