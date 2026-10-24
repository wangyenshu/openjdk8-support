/*
 * openjdk8-web.js -- run Java (OpenJDK 8, WebAssembly) in a web page.
 *
 *   <script src="openjdk8-web.js"></script>
 *
 * Applets: every <applet>, <object type="application/x-java-applet"> and
 * <embed type="application/x-java-applet"> element on the page is started
 * automatically (disable with data-applets="off" on the script tag, or call
 * OpenJDK8.runApplets() yourself).  So are the applets that Oracle's
 * deployJava.js writes with deployJava.runApplet(...), and an applet with a
 * jnlp_href parameter takes its class and jars from that JNLP file.
 *
 * Applications:
 *   OpenJDK8.run({ args: ['-cp', '/app', 'Main'], root: element,
 *                  files: { '/app/Main.class': 'Main.class' } })
 *
 * Java Web Start: following a link to a .jnlp file starts the application
 * with IcedTea-Web's javaws (openjdk8-javaws.jar) instead (disable with
 * data-jnlp="off" on the script tag), as does OpenJDK8.runJNLP(url) or
 * deployJava.launch(url) of deployJava.js.
 *
 * Frames: iframes and frames of the same origin that have applets or Web
 * Start links get a copy of this script (disable with data-frames="off").
 *
 * The runtime files (openjdk8.js, openjdk8.wasm, openjdk8-jre.json, openjdk8-jre.data.gz,
 * openjdk8-javaws.jar) are loaded from the directory of this script, or from
 * data-base / options.base.
 *
 * Copyright (c) 2026 emscripten-forge contributors.  GPL-2.0 with the
 * Classpath exception, like OpenJDK.
 */
(function (global) {
  'use strict';

  var thisScript = document.currentScript;
  var defaultBase = (thisScript && (thisScript.getAttribute('data-base') ||
                     thisScript.src.replace(/[^\/]*$/, ''))) || './';

  // System properties for the browser environment.
  var DEFAULT_JVM_ARGS = [
    '-Djava.protocol.handler.pkgs=org.emscriptenforge.jvm.net',
    '-Dsun.java2d.pmoffscreen=false',
    '-Dsun.java2d.xrender=false',
    '-Duser.dir=/home/web_user',
    // there is no password database to take these from
    '-Duser.home=/home/web_user',
    '-Duser.name=web_user',
    // x11.wasm keeps window contents (canvases), so Swing need not keep a
    // back buffer per window; with one, a window resized right after its
    // first paint could stay blank until repainted
    '-Dswing.bufferPerWindow=false',
  ];

  var STYLE = [
    // (x11.wasm styles .x11-wasm-root as a relative, clipped box; the applet
    // overlay must be absolutely positioned at the document origin)
    'div.openjdk8-root,div.openjdk8-root.x11-wasm-root{position:absolute!important;left:0;top:0;margin:0;padding:0;border:0;',
    'pointer-events:none;z-index:2147483000;overflow:visible!important;background:transparent!important}',
    '.openjdk8-root .x11-wasm-window{pointer-events:auto}',
    '.openjdk8-applet-box{display:inline-block;position:relative;box-sizing:border-box;background:#f2f2f2;',
    'border:1px solid #c9c9c9;color:#555;font:12px/1.4 system-ui,sans-serif;overflow:hidden;vertical-align:bottom}',
    '.openjdk8-applet-box span{position:absolute;left:8px;right:8px;top:50%;transform:translateY(-50%);text-align:center}',
    // Web Start: the X screen is the viewport
    'div.openjdk8-javaws-root,div.openjdk8-javaws-root.x11-wasm-root{position:fixed!important;left:0;top:0;',
    'width:100vw;height:100vh;margin:0;padding:0;border:0;pointer-events:none;z-index:2147483000;',
    'overflow:hidden!important;background:transparent!important}',
    '.openjdk8-javaws-root .x11-wasm-window,.openjdk8-javaws-root [data-x11-wasm-frame]{pointer-events:auto}',
    '.openjdk8-javaws-status{position:fixed;right:12px;bottom:12px;z-index:2147483001;padding:6px 10px;',
    'background:#222;color:#eee;font:12px/1.4 system-ui,sans-serif;border-radius:4px;opacity:.9}',
  ].join('');

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (global.createOpenJDK8Module) return resolve();
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('cannot load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function addStyle() {
    if (document.getElementById('openjdk8-style')) return;
    var st = document.createElement('style');
    st.id = 'openjdk8-style';
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  var running = null;   // only one JVM per page

  /**
   * Start a JVM.  options: args (array), root (element for windows),
   * base, files ({vmPath: url}), env, jvmArgs (extra), onStdout, onStderr,
   * onStatus, onProgress, onExit, heap (e.g. '256m'), documentTitle (false:
   * keep the page title), audioContext (an AudioContext to play sound on),
   * windowManager (true: x11.wasm draws title bars, so that top-level
   * windows can be moved, minimized and closed).
   * Returns a promise for the Emscripten module once main() has started.
   */
  function run(options) {
    options = options || {};
    if (running) return Promise.reject(new Error('a Java VM is already running in this page'));
    var base = options.base || defaultBase;
    if (base && base.slice(-1) !== '/') base += '/';
    var files = options.files || {};
    running = loadScript(base + 'openjdk8.js').then(function () {
      return global.createOpenJDK8Module({
        thisProgram: '/java/bin/java',
        noInitialRun: true,
        locateFile: function (p) { return base + p; },
        x11WasmRoot: options.root,
        // the title of a top-level Java window becomes the page title
        // unless documentTitle is false (always false for applets)
        x11WasmDocumentTitle: options.documentTitle !== false,
        x11WasmWindowManager: !!options.windowManager,
        audioContext: options.audioContext,
        javaEnv: options.env || {},
        print: options.onStdout || function (s) { console.log(s); },
        printErr: options.onStderr || function (s) { console.warn(s); },
        onAppletStatus: options.onStatus || function () {},
        onJreProgress: options.onProgress,
        onExit: options.onExit,
        preRun: [function (M) {
          var names = Object.keys(files);
          if (!names.length) return;
          M.addRunDependency('java-app-files');
          Promise.all(names.map(function (vmPath) {
            return fetch(files[vmPath]).then(function (r) {
              if (!r.ok) throw new Error(files[vmPath] + ': HTTP ' + r.status);
              return r.arrayBuffer();
            }).then(function (buf) {
              M.FS.mkdirTree(vmPath.replace(/\/[^\/]*$/, '') || '/');
              M.FS.writeFile(vmPath, new Uint8Array(buf));
            });
          })).then(function () {
            M.removeRunDependency('java-app-files');
          }, function (e) {
            console.error('Java: ' + e);
          });
        }],
      });
    }).then(function (M) {
      var args = DEFAULT_JVM_ARGS.slice();
      if (options.heap) args.push('-Xmx' + options.heap);
      args = args.concat(options.jvmArgs || [], options.args || []);
      M.javaMain = M.callMain(args);
      Promise.resolve(M.javaMain).then(function (rc) {
        if (options.onExit) options.onExit(rc);
      }, function (e) {
        if (options.onExit) options.onExit(e && e.status !== undefined ? e.status : -1);
      });
      return M;
    });
    return running;
  }

  // ------------------------------------------------------------- applets

  function attr(el, name) {
    var v = el.getAttribute(name);
    return v === null ? null : v;
  }

  function paramsOf(el) {
    var params = {};
    var ps = el.querySelectorAll(':scope > param');
    for (var i = 0; i < ps.length; i++) {
      var n = ps[i].getAttribute('name');
      if (n) params[n.toLowerCase()] = ps[i].getAttribute('value') || '';
    }
    return params;
  }

  function describe(el) {
    var tag = el.tagName.toLowerCase();
    var params = paramsOf(el);
    var spec = { el: el, params: {} };
    if (tag === 'applet') {
      spec.code = attr(el, 'code');
      spec.codebase = attr(el, 'codebase');
      spec.archive = attr(el, 'archive');
      spec.name = attr(el, 'name') || attr(el, 'id');
    } else {
      var type = (attr(el, 'type') || '').toLowerCase();
      var classid = attr(el, 'classid') || '';
      var isJava = type.indexOf('java') >= 0 || /^java:/i.test(classid) ||
                   /8AD9C840-044E-11D1-B3E9-00805F499D93/i.test(classid);
      if (!isJava) return null;
      spec.code = attr(el, 'code') || params.code || (/^java:/i.test(classid) ? classid.slice(5) : null);
      spec.codebase = attr(el, 'codebase') || params.codebase || attr(el, 'java_codebase') || params.java_codebase;
      if (spec.codebase && /^https?:\/\/java\.sun\.com/i.test(spec.codebase)) spec.codebase = params.codebase || null;
      spec.archive = attr(el, 'archive') || params.archive || params.java_archive;
      spec.name = attr(el, 'name') || attr(el, 'id') || params.name;
      ['code', 'codebase', 'archive', 'type', 'name', 'java_codebase', 'java_archive',
       'java_code', 'java_type', 'scriptable', 'mayscript'].forEach(function (k) { delete params[k]; });
      if (!spec.code && params.java_code) spec.code = params.java_code;
    }
    // Java 6u10+ applets can be described by a JNLP file (resolveJnlp)
    spec.jnlp = params.jnlp_href || null;
    if (!spec.code && !spec.jnlp) return null;
    if (tag === 'embed') {
      // <embed> carries applet parameters as attributes
      for (var i = 0; i < el.attributes.length; i++) {
        var a = el.attributes[i].name.toLowerCase();
        if (['type', 'code', 'codebase', 'archive', 'width', 'height', 'name', 'id',
             'src', 'pluginspage', 'style', 'class'].indexOf(a) < 0) {
          params[a] = el.attributes[i].value;
        }
      }
    }
    spec.params = params;
    spec.width = size(el, 'width', 300);
    spec.height = size(el, 'height', 200);
    return spec;
  }

  // width or height in pixels, or percent of the parent element (0 is a
  // size: such applets open windows of their own)
  function size(el, name, def) {
    var v = attr(el, name);
    var n = v === null ? NaN : parseFloat(v);
    if (isNaN(n)) return def;
    if (/%\s*$/.test(v)) {
      var p = el.parentNode;
      n = p ? (name === 'width' ? p.clientWidth : p.clientHeight) * n / 100 : 0;
      return Math.round(n) || def;
    }
    return Math.round(n);
  }

  function findApplets(root) {
    var out = [];
    var els = (root || document).querySelectorAll('applet, object, embed');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.closest('applet, object') && el.closest('applet, object') !== el) continue; // nested fallback
      var spec = describe(el);
      if (spec) out.push(spec);
    }
    return out;
  }

  /**
   * An applet with a jnlp_href parameter: take its class, jars and codebase
   * from the JNLP file, as the Java Plug-in did (its <applet-desc> parameters
   * too, unless the tag gives the same one).  If the file cannot be read,
   * the tag's attributes are used as they are.
   */
  function resolveJnlp(a) {
    if (!a.jnlp) return Promise.resolve();
    var url = new URL(a.jnlp, new URL(a.codebase || '.', location.href)).href;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      var jnlp = new DOMParser().parseFromString(text, 'application/xml').documentElement;
      if (!jnlp || jnlp.nodeName !== 'jnlp') throw new Error('not a JNLP file');
      var cb = jnlp.getAttribute('codebase');
      var desc = jnlp.querySelector('applet-desc');
      var jars = [];
      jnlp.querySelectorAll('resources').forEach(function (r) {
        var os = r.getAttribute('os');
        if (os && !/linux/i.test(os)) return;
        r.querySelectorAll(':scope > jar').forEach(function (j) {
          var h = j.getAttribute('href');
          if (h) j.getAttribute('main') === 'true' ? jars.unshift(h) : jars.push(h);
        });
      });
      a.codebase = new URL(cb ? cb.replace(/\/*$/, '/') : '.', url).href;
      if (jars.length) a.archive = jars.join(',');
      if (desc && desc.getAttribute('main-class')) a.code = desc.getAttribute('main-class');
      if (desc) desc.querySelectorAll('param').forEach(function (p) {
        var n = (p.getAttribute('name') || '').toLowerCase();
        if (n && !(n in a.params)) a.params[n] = p.getAttribute('value') || '';
      });
    }).catch(function (e) { console.warn('Java applet: ' + url + ': ' + e.message); });
  }

  function documentSize() {
    var d = document.documentElement, b = document.body;
    return {
      w: Math.max(d.scrollWidth, b ? b.scrollWidth : 0, d.clientWidth),
      h: Math.max(d.scrollHeight, b ? b.scrollHeight : 0, d.clientHeight),
    };
  }

  function boxPosition(box) {
    var r = box.getBoundingClientRect();
    return { x: Math.round(r.left + global.pageXOffset + 1), y: Math.round(r.top + global.pageYOffset + 1) };
  }

  /**
   * Start all applets of the page in one JVM.  options as for run(), plus
   * applets (from findApplets()).
   */
  function runApplets(options) {
    options = options || {};
    var applets = options.applets || findApplets();
    if (!applets.length) return Promise.resolve(null);
    addStyle();

    // A box in the page flow reserves the applet's space; the applet's
    // window is placed over it in a page-sized overlay (the X screen).
    applets.forEach(function (a) {
      a.el.__openjdk8 = true;
      var box = document.createElement('div');
      box.className = 'openjdk8-applet-box';
      box.style.width = a.width + 'px';
      box.style.height = a.height + 'px';
      if (!a.width || !a.height) box.style.border = '0';
      box.innerHTML = '<span>Loading Java&hellip;</span>';
      a.el.parentNode.insertBefore(box, a.el);
      a.el.style.display = 'none';
      a.box = box;
    });
    var root = document.createElement('div');
    root.className = 'openjdk8-root';
    var size = documentSize();
    root.style.width = size.w + 'px';
    root.style.height = size.h + 'px';
    document.body.appendChild(root);

    var setText = function (t) {
      applets.forEach(function (a) {
        var s = a.box.querySelector('span');
        if (s) s.textContent = t;
      });
    };

    return Promise.all(applets.map(resolveJnlp)).then(function () {
      applets = applets.filter(function (a) {
        if (!a.code) a.box.querySelector('span').textContent = 'Java applet: no class to run';
        return a.code;
      });
      if (!applets.length) return null;

      // Positions are polled by the applet host (see AppletRunner).
      global.__openjdk8AppletLayout = function () {
        var sz = documentSize();
        root.style.width = sz.w + 'px';
        root.style.height = sz.h + 'px';
        return applets.map(function (a) { var p = boxPosition(a.box); return p.x + ',' + p.y; }).join(';');
      };

      var args = ['org.emscriptenforge.jvm.applet.AppletRunner', '--documentbase', location.href];
      applets.forEach(function (a) {
        var p = boxPosition(a.box);
        args.push('--applet', 'code=' + a.code,
                  'width=' + Math.max(a.width, 1), 'height=' + Math.max(a.height, 1),
                  'x=' + p.x, 'y=' + p.y);
        if (a.codebase) args.push('codebase=' + a.codebase);
        if (a.archive) args.push('archive=' + a.archive);
        if (a.name) args.push('name=' + a.name);
        Object.keys(a.params).forEach(function (k) { args.push('param:' + k + '=' + a.params[k]); });
      });

      var userStatus = options.onStatus;
      return run(Object.assign({}, options, {
        root: root,
        documentTitle: false,
        args: (options.jvmArgs || []).concat(args),
        jvmArgs: [],
        onProgress: function (loaded, total) {
          setText('Loading Java runtime ' + Math.round(100 * loaded / Math.max(total, 1)) + '%');
          if (options.onProgress) options.onProgress(loaded, total);
        },
        onStatus: function (text) {
          if (/started$/.test(text)) {
            applets.forEach(function (a) { var s = a.box.querySelector('span'); if (s) s.textContent = ''; });
          } else if (/failed/.test(text)) {
            setText(text);
          } else if (/^Loading/.test(text)) {
            setText(text);
          }
          try { global.status = text; } catch (e) {}
          if (userStatus) userStatus(text);
        },
      }));
    });
  }

  // -------------------------------------------------------- Web Start

  /**
   * Java Web Start: run the application (or applet) a JNLP file describes,
   * with IcedTea-Web's javaws.  url is resolved against the page; the JNLP
   * file and its jars are fetched like any URL the Java code opens (same
   * origin, or CORS).  Its windows appear in a viewport-sized layer over the
   * page.  options as for run(), plus javawsArgs (more javaws options, e.g.
   * ['-verbose']).  The security dialogs of javaws (unsigned code, missing
   * manifest attributes, certificates) are shown like any Java window.
   */
  function runJNLP(url, options) {
    options = options || {};
    var base = options.base || defaultBase;
    if (base && base.slice(-1) !== '/') base += '/';
    var href = new URL(url, location.href).href;
    addStyle();
    var root = options.root;
    if (!root) {
      root = document.createElement('div');
      root.className = 'openjdk8-javaws-root';
      document.body.appendChild(root);
    }
    var status = null;
    if (!options.onProgress && !options.onStatus) {
      status = document.createElement('div');
      status.className = 'openjdk8-javaws-status';
      status.textContent = 'Starting Java Web Start\u2026';
      document.body.appendChild(status);
    }
    var done = function () { if (status && status.parentNode) status.parentNode.removeChild(status); };
    var files = Object.assign({}, options.files || {});
    files['/java/lib/javaws.jar'] = base + 'openjdk8-javaws.jar';
    var userExit = options.onExit;
    var userStdout = options.onStdout;
    return run(Object.assign({}, options, {
      root: root,
      files: files,
      documentTitle: options.documentTitle === true,
      // like IcedTea-Web's javaws launcher; -Xnofork: there are no processes
      // to relaunch the VM with the JNLP file's JVM options
      args: (options.jvmArgs || []).concat([
        '-Xbootclasspath/a:/java/lib/javaws.jar',
        '-Dicedtea-web.bin.name=javaws',
        'net.sourceforge.jnlp.runtime.Boot', '-Xnofork',
      ], options.javawsArgs || [], [href]),
      jvmArgs: [],
      onProgress: options.onProgress || function (loaded, total) {
        if (status) status.textContent = 'Loading Java runtime ' +
          Math.round(100 * loaded / Math.max(total, 1)) + '%';
      },
      onStdout: function (s) {
        // javaws reports the start of the application on the console
        if (/^Starting application/.test(s)) done();
        (userStdout || function (t) { console.log(t); })(s);
      },
      onExit: function (rc) { done(); if (userExit) userExit(rc); },
    })).then(function (M) {
      // the splash screen or a security dialog is up after a while
      setTimeout(done, 15000);
      return M;
    }, function (e) { done(); throw e; });
  }

  // a link to a JNLP file (in whatever window it would open: there it would
  // only be downloaded)
  function isJnlpLink(a) {
    return a && a.href && /\.jnlp$/i.test(a.pathname) && !a.hasAttribute('download');
  }

  // ------------------------------------------- pages for the Java Plug-in

  // deployJava.js (Oracle's Deployment Toolkit): deployJava.runApplet(...)
  // writes an <applet> tag with document.write, except in browsers without
  // the Java Plug-in, where it shows a "Java Plug-in is not supported" box
  // instead; launch(url), launchEx(url) and launchWebStartApplication(url)
  // (the createWebStartLaunchButton button) download the JNLP file or open
  // a jnlp: URL.
  var writes = null;        // document.write output, while it is captured
  var appletScripts = [];   // scripts whose runApplet wrote their applets

  function captureWrites(fn) {
    var outer = writes;
    writes = [];
    document.write = function () { writes.push([].join.call(arguments, '')); };
    document.writeln = function () { writes.push([].join.call(arguments, '') + '\n'); };
    try { fn(); } finally {
      var html = writes.join('');
      writes = outer;
      if (!outer) { delete document.write; delete document.writeln; }
    }
    return html;
  }

  function patchDeployJava(applets, jnlp) {
    var dj = global.deployJava;
    if (!dj || dj.__openjdk8) return;
    dj.__openjdk8 = true;
    if (applets) {
      dj.runApplet = function (attributes, parameters) {
        var script = document.currentScript;
        if (writes || (script && document.readyState === 'loading')) {
          // the page is being parsed (or a script runs again, below)
          if (script) appletScripts.push(script);
          dj.writeAppletTag(attributes, parameters);
          return;
        }
        // called later, from an event handler: add the applet to the page
        var html = captureWrites(function () { dj.writeAppletTag(attributes, parameters); });
        if (script) script.insertAdjacentHTML('afterend', html);
        else document.body.insertAdjacentHTML('beforeend', html);
        startApplets();
      };
    }
    if (jnlp) {
      dj.isWebStartInstalled = function () { return true; };
      dj.launch = dj.launchEx = dj.launchWebStartApplication = function (url) {
        startJNLP(url);
        return true;
      };
    }
  }

  // Scripts that called deployJava.runApplet before this script was loaded
  // (a bookmarklet) wrote nothing: run them again, putting what they write
  // after them.
  function rerunAppletScripts() {
    if (!global.deployJava) return;
    var scripts = document.querySelectorAll('script:not([src])');
    for (var i = 0; i < scripts.length; i++) {
      var sc = scripts[i];
      if (appletScripts.indexOf(sc) >= 0 || sc.__openjdk8) continue;
      if (sc.type && !/javascript|ecmascript|^text\/jscript$/i.test(sc.type)) continue;
      if (!/deployJava\s*\.\s*runApplet\s*\(/.test(sc.text)) continue;
      sc.__openjdk8 = true;
      try {
        var html = captureWrites(function () { (0, eval)(sc.text); });
        if (html) sc.insertAdjacentHTML('afterend', html);
      } catch (e) {
        console.warn('Java applet: running the page script again failed: ' + e);
      }
    }
  }

  // the "Java Plug-in is not supported by this browser" box of deployJava.js
  function removePluginNotice(root) {
    var box = (root || document).querySelector('#messagebox');
    if (box && box.querySelector('a[href*="java.com/dt-redirect"]')) box.parentNode.removeChild(box);
  }

  // the applets not started yet
  function startApplets() {
    var applets = findApplets().filter(function (a) { return !a.el.__openjdk8; });
    if (!applets.length) return;
    if (running) console.warn('Java applet: a Java VM is already running in this page');
    else runApplets({ applets: applets });
  }

  function startJNLP(url) {
    if (running) console.warn('Java Web Start: a Java VM is already running in this page');
    else runJNLP(url).catch(function (e) { console.error('Java Web Start: ' + e); });
  }

  // Frames of the same origin (iframes, framesets) that have applets or
  // Web Start links get their own copy of this script; the frames of other
  // sites cannot be reached.
  function frameNeedsJava(win, doc) {
    if (win.deployJava || doc.querySelector('applet, object, embed, iframe, frame')) return true;
    return [].some.call(doc.links, isJnlpLink);
  }

  function initFrame(frame) {
    var win, doc;
    try { win = frame.contentWindow; doc = frame.contentDocument; } catch (e) { return; }
    if (!win || !doc || !doc.documentElement || win.OpenJDK8 || doc.__openjdk8) return;
    if (!frameNeedsJava(win, doc)) return;
    doc.__openjdk8 = true;
    var s = doc.createElement('script');
    s.src = thisScript.src;
    s.setAttribute('data-base', new URL(defaultBase, location.href).href);
    ['data-applets', 'data-jnlp', 'data-frames'].forEach(function (n) {
      if (thisScript.hasAttribute(n)) s.setAttribute(n, thisScript.getAttribute(n));
    });
    (doc.body || doc.documentElement).appendChild(s);
  }

  function initFrames() {
    var frames = document.querySelectorAll('iframe, frame');
    for (var i = 0; i < frames.length; i++) {
      var f = frames[i];
      if (!f.__openjdk8) {
        f.__openjdk8 = true;
        // again whenever another page is loaded into it
        f.addEventListener('load', initFrame.bind(null, f));
      }
      initFrame(f);
    }
  }

  global.OpenJDK8 = { run: run, runApplets: runApplets, findApplets: findApplets,
                      runJNLP: runJNLP, defaultJvmArgs: DEFAULT_JVM_ARGS };

  var opt = function (name) { return !thisScript || thisScript.getAttribute(name) !== 'off'; };
  var autoApplets = opt('data-applets'), autoJnlp = opt('data-jnlp');
  var ready = function () {
    patchDeployJava(autoApplets, autoJnlp);
    if (autoApplets) {
      rerunAppletScripts();
      removePluginNotice();
      // deployJava.js adds its box once the page has loaded
      new MutationObserver(function () { removePluginNotice(); })
        .observe(document.body, { childList: true });
      startApplets();
    }
    if (opt('data-frames') && thisScript && thisScript.src) initFrames();
  };
  patchDeployJava(autoApplets, autoJnlp);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready);
  else ready();
  if (autoJnlp) {
    // before the page's own handlers (capture phase): pages often open such
    // links with scripts of their own, e.g. in a popup, where the file would
    // only be downloaded
    document.addEventListener('click', function (ev) {
      if (ev.defaultPrevented || ev.button !== 0 || ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
      var a = ev.target && ev.target.closest ? ev.target.closest('a[href]') : null;
      if (!isJnlpLink(a)) return;
      ev.preventDefault();
      ev.stopPropagation();
      startJNLP(a.href);
    }, true);
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);
