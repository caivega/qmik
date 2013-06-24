/**
 * @author:leochen
 * @email:cwq0312@163.com
 * @version:0.91.008
 */
(function(Q) {
	var win = Q.global, doc = win.document, loc = win.location, hostname = loc.hostname;
	var isArray = Q.isArray, isString = Q.isString, isFun = Q.isFun, isNull = Q.isNull, each = Q.each;
	var config = {
		alias : {},
		paths : {},
		vars : {},
		map : [],
		preload : []
	};
	var cacheModule = {}, currentScript;
	var sun = {};
	function Module(id, url, dependencies, factory) {
		var me = this;
		Q.extend(me, {
			id : id || url,
			url : url,
			dir : url.replace(/(\?.*)?/, "").replace(/(\/[^\/]*)$/i, "/"),//当前目录
			dependencies : dependencies,// 依赖模块
			factory : factory,
			// module is ready ,if no, request src from service
			isReady : !1,// is ready ,default false,
			exports : {},// export object
			createTime : Q.now(),// create time
			useCount : 0,// use count,使用次数
			destroy : function() {
				Q("script[_src='" + url + "']").remove();
				delete cacheModule[id], cacheModule[url]
			}
		})
	}
	// factory:function(require, exports, module)
	function define(id, dependencies, factory) {
		var url = getCurrentScript().src;
		if (isFun(id)) {
			factory = id;
			dependencies = [];
			id = url;
		} else if (isFun(dependencies)) {
			factory = dependencies;
			dependencies = []
		}
		id = id2url(id)
		if (!getModule(id) || !Q.isIE()) {
			dependencies = dependencies.concat(parseDepents(factory));
			cacheModule[url] = cacheModule[id] = new Module(id, url, Q.unique(dependencies), factory)
		}
	}
	/** 清除注释 */
	function clearNode(word) {
		return word.replace(/(\/\/)\S*[^\n]*/g, "").replace(/\/\*[\S\s]*\*\//g, "")
	}
	// get depends from function.toString()
	function parseDepents(code) {
		code = clearNode(code.toString());
		var params = code.replace(/^\s*function\s*\w*\s*/, "").match(/^\([\w ,]*\)/)[0].replace("\(", "").replace("\)", "");
		var match = [], idx = params.indexOf(",");
		if (idx >= 0) {
			var require = params.substring(0, idx), pattern = new RegExp(require + "\s*[(]\s*[\"']([^\"'\)]+)[\"']\s*[)]", "g");
			match = Q.map(code.match(pattern), function(i, v) {
				return v.replace(new RegExp("^" + require + "\s*[(]\s*[\"']"), "").replace(/\s*[\"']\s*[)]$/, "")
			})
		}
		return match
	}
	var uses = [], notLoading = !0//is not loading,default=true;
	function loadError() {
		uses.splice(0, 1);
		notLoading = !0;
		loadSyncUses()
	}
	/** 同步加载使用的模块 */
	function loadSyncUses() {
		if (notLoading && uses.length > 0) {
			notLoading = !1;
			preload(function() {
				var us = uses[0], ids = us.ids, callback = us.callback;
				callbackUse(ids, function() {
					uses.splice(0, 1);
					notLoading = !0;
					callback && callback.apply(callback, arguments);
					loadSyncUses()
				})
			})
		}
	}
	function use(ids, callback) {
		ids = isArray(ids) ? ids : [
			ids
		];
		//下面检测使用的模块是否已被全部加载过
		var r = Q.grep(ids, function(val) {
			return !isNull(getModule(id2url(val), val))
		});
		if (r.length == ids.length) {
			callbackUse(ids, callback)
		} else {
			uses.push({
				ids : ids,
				callback : callback
			});
			loadSyncUses()
		}
	}
	/** 回调使用的模块 */
	function callbackUse(ids, callback) {
		if (ids.length > 0) {
			var params = [];
			(function bload(idx) {
				load(ids[idx], function(exports) {
					params.push(exports);
					if (idx == ids.length - 1) {
						callback && callback.apply(callback, params);
					} else {
						bload(idx + 1)
					}
				})
			})(0)
		}
	}
	// require module
	function require(id) {
		var module = getModule(id2url(id), id);
		return module ? module.exports : null
	}
	require.url = id2url;
	// pre load module
	function preload(callback, deps) {
		var dependencies = deps || config.preload, length = dependencies.length, params = [];
		length == 0 ? callback() : (function bload(idx) {
			load(dependencies[idx], function(exports) {
				params.push(exports);
				idx == length - 1 ? callback && callback.apply(callback, params) : bload(idx + 1)
			})
		})(0)
	}
	function load(id, callback) {
		var url = id2url(id);
		if (id == ".js") return;
		var module = getModule(url, id);
		if (module) {
			if (module.isReady) {
				useModule(module, require, callback)
			} else {
				preload(function() {
					useModule(module, require, callback)
				}, module.dependencies)
			}
		} else {
			request(id, function() {
				// useModule(getModule(id), require, callback)
				preload(function() {
					useModule(getModule(url, id), require, callback)
				}, getModule(url, id).dependencies)
			}, loadError)
		}
	}
	function getModule(url, id) {
		return cacheModule[url] || cacheModule[id]
	}
	function useModule(module, require, callback) {
		if (module.isReady != !0) {
			var nm = module.factory(require, module.exports, module);
			module.exports = module.exports || nm
		}
		module.isReady = !0;
		module.useCount++;
		callback && callback(module.exports)
	}
	function request(id, success, error) {
		var url = id2url(id), loadScript = Q("script[_src='" + url + "']");
		if (/\/.+\.css$/i.test(url.replace(/(\?.*)?/i, ""))) {
			Q.getCss(url)
		} else {
			var _load = Q.box(success);
			loadScript.length < 1 ? (currentScript = Q.getScript(url, _load, error)) : loadScript.on("load", _load).on("readystatechange", _load)
				.on("error", error)
		}
	}
	function getCurrentScript() {
		currentScript = currentScript || Q("script")[0];
		return currentScript
	}
	// //////////////// id to url start ///////////////////////////////
	function id2url(id) {
		isNull(id) && (id = loc.href);
		id = alias2url(id);
		id = paths2url(id);
		id = vars2url(id);
		id = normalize(id);
		return map2url(id)
	}
	function normalize(url) {
		url = Q.url(url);
		return !/\?/.test(url) && !/\.(css|js)$/.test(url) ? url + ".js" : url
	}
	function alias2url(id) {
		return config.alias[id] || id;
	}
	function paths2url(id) {
		var keys = id.match(/^(\/?[0-9a-zA-Z._]+)/), key = keys ? keys[0] : id;
		return keys ? id.replace(new RegExp("^" + key), config.paths[key] || key) : id
	}
	function vars2url(id) {
		var key = id.match(/\{[0-9a-zA-Z._]+\}/);
		key = key ? key[0] : id;
		return id.replace(new RegExp(key, "g"), config.vars[key] || key)
	}
	function map2url(id) {
		each(config.map, function(i, v) {
			id = id.match(v[0]) ? id.replace(v[0], v[1]) : id
		});
		return id
	}
	// ////////////////id to url end ///////////////////////////////
	Q.extend(sun, {
		use : Q.box(use),
		// factory:function(require, exports, module)
		define : Q.box(define),
		config : function(opts) {
			return Q.config(opts, config)
		},
		url : id2url
	});
	////////////////////////////////////////
	//mem clear
	var ttl = 300000;//缓存模块回收内存时间
	Q.cycle(function() {
		each(cacheModule, function(key, module) {
			module.useCount < (Q.now() - module.createTime) / ttl && module.destroy()
		})
	}, ttl);
	Q.sun = sun;
	win.define = Q.define = Q.sun.define;
	win.use = Q.use = Q.sun.use
})(Qmik);
