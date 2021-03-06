// Generated by CoffeeScript 1.10.0
(function() {
  var ABORT, CHANNEL_URL_PREFIX, Channel, CookieJar, MAX_RETRIES, NetworkError, ORIGIN_URL, PushDataParser, Q, UA, authhead, crypto, find, fmterr, isUnknownSID, log, op, ref, req, request, sapisidof, wait,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  require('fnuc').expose(global);

  CookieJar = require('tough-cookie').CookieJar;

  request = require('request');

  crypto = require('crypto');

  log = require('bog');

  Q = require('q');

  ref = require('./util'), req = ref.req, find = ref.find, wait = ref.wait, NetworkError = ref.NetworkError, fmterr = ref.fmterr;

  PushDataParser = require('./pushdataparser');

  ORIGIN_URL = 'https://talkgadget.google.com';

  CHANNEL_URL_PREFIX = 'https://0.client-channel.google.com/client-channel';

  UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/41.0.2272.118 Safari/537.36';

  op = function(o) {
    return CHANNEL_URL_PREFIX + "/" + o;
  };

  isUnknownSID = function(res) {
    return res.statusCode === 400 && res.statusMessage === 'Unknown SID';
  };

  ABORT = {};

  authhead = function(sapisid, msec, origin) {
    var auth_hash, auth_string;
    auth_string = msec + " " + sapisid + " " + origin;
    auth_hash = crypto.createHash('sha1').update(auth_string).digest('hex');
    return {
      authorization: "SAPISIDHASH " + msec + "_" + auth_hash,
      'x-origin': origin,
      'x-goog-authuser': '0'
    };
  };

  sapisidof = function(jarstore) {
    var cookie, cookies, jar;
    jar = new CookieJar(jarstore);
    cookies = jar.getCookiesSync(ORIGIN_URL);
    cookie = find(cookies, function(cookie) {
      return cookie.key === 'SAPISID';
    });
    return cookie != null ? cookie.value : void 0;
  };

  MAX_RETRIES = 5;

  module.exports = Channel = (function() {
    function Channel(jarstore1, proxy) {
      this.jarstore = jarstore1;
      this.proxy = proxy;
      this.subscribe = bind(this.subscribe, this);
      this.reqpoll = bind(this.reqpoll, this);
      this.poll = bind(this.poll, this);
      this.stop = bind(this.stop, this);
      this.start = bind(this.start, this);
      this.getLines = bind(this.getLines, this);
      this.fetchSid = bind(this.fetchSid, this);
      this.fetchPvt = bind(this.fetchPvt, this);
      this.pushParser = new PushDataParser();
    }

    Channel.prototype.fetchPvt = function() {
      var opts;
      log.debug('fetching pvt');
      opts = {
        method: 'GET',
        uri: ORIGIN_URL + "/talkgadget/_/extension-start",
        jar: request.jar(this.jarstore)
      };
      return req(opts).then((function(_this) {
        return function(res) {
          var data;
          data = JSON.parse(res.body);
          log.debug('found pvt token', data[1]);
          return data[1];
        };
      })(this)).fail(function(err) {
        log.info('fetchPvt failed', fmterr(err));
        return Q.reject(err);
      });
    };

    Channel.prototype.authHeaders = function() {
      var sapisid;
      sapisid = sapisidof(this.jarstore);
      if (!sapisid) {
        log.warn('no SAPISID cookie');
        return null;
      }
      return authhead(sapisid, Date.now(), ORIGIN_URL);
    };

    Channel.prototype.fetchSid = function() {
      var auth;
      auth = this.authHeaders();
      if (!auth) {
        return Q.reject(new Error("No auth headers"));
      }
      return Q().then((function(_this) {
        return function() {
          var opts;
          opts = {
            method: 'POST',
            uri: op('channel/bind'),
            jar: request.jar(_this.jarstore),
            qs: {
              VER: 8,
              RID: 81187,
              ctype: 'hangouts'
            },
            form: {
              count: 0
            },
            headers: auth,
            encoding: null
          };
          return req(opts).then(function(res) {
            var _, gsid, line, p, ref1, ref2, ref3, ref4, ref5, sid;
            if (res.statusCode === 200) {
              p = new PushDataParser(res.body);
              line = p.pop();
              ref1 = line[0], _ = ref1[0], (ref2 = ref1[1], _ = ref2[0], sid = ref2[1]);
              ref3 = line[1], _ = ref3[0], (ref4 = ref3[1], (ref5 = ref4[0], gsid = ref5.gsid));
              log.debug('found sid/gsid', sid, gsid);
              return {
                sid: sid,
                gsid: gsid
              };
            } else {
              return log.warn('failed to get sid', res.statusCode, res.body);
            }
          });
        };
      })(this)).fail(function(err) {
        log.info('fetchSid failed', fmterr(err));
        return Q.reject(err);
      });
    };

    Channel.prototype.getLines = function() {
      if (!this.running) {
        this.start();
      }
      return this.pushParser.allLines();
    };

    Channel.prototype.start = function() {
      var retries, run;
      retries = MAX_RETRIES;
      this.running = true;
      this.sid = null;
      this.gsid = null;
      this.subscribed = false;
      run = (function(_this) {
        return function() {
          if (!_this.running) {
            return;
          }
          return _this.poll(retries).then(function() {
            retries = MAX_RETRIES;
            return run();
          }).fail(function(err) {
            if (err === ABORT) {
              return;
            }
            retries--;
            log.debug('poll error', err);
            if (retries > 0) {
              return run();
            } else {
              _this.running = false;
              return _this.pushParser.reset(err);
            }
          });
        };
      })(this);
      run();
      return null;
    };

    Channel.prototype.stop = function() {
      var ref1, ref2;
      log.debug('channel stop');
      this.running = false;
      if ((ref1 = this.pushParser) != null) {
        if (typeof ref1.reset === "function") {
          ref1.reset();
        }
      }
      return (ref2 = this.currentReq) != null ? typeof ref2.abort === "function" ? ref2.abort() : void 0 : void 0;
    };

    Channel.prototype.poll = function(retries) {
      return Q().then(function() {
        var backoffTime;
        backoffTime = 2 * (MAX_RETRIES - retries) * 1000;
        if (backoffTime) {
          log.debug('backing off for', backoffTime, 'ms');
        }
        return wait(backoffTime);
      }).then((function(_this) {
        return function() {
          if (!_this.running) {
            return Q.reject(ABORT);
          }
        };
      })(this)).then((function(_this) {
        return function() {
          if (!_this.sid) {
            return _this.fetchSid().then(function(o) {
              merge(_this, o);
              return _this.pushParser.reset();
            });
          }
        };
      })(this)).then((function(_this) {
        return function() {
          return _this.reqpoll();
        };
      })(this));
    };

    Channel.prototype.reqpoll = function() {
      return Q.Promise((function(_this) {
        return function(rs, rj) {
          var ok, opts;
          log.debug('long poll req');
          opts = {
            method: 'GET',
            uri: op('channel/bind'),
            jar: request.jar(_this.jarstore),
            qs: {
              VER: 8,
              gsessionid: _this.gsid,
              RID: 'rpc',
              t: 1,
              SID: _this.sid,
              CI: 0,
              ctype: 'hangouts',
              TYPE: 'xmlhttp'
            },
            headers: _this.authHeaders(),
            encoding: null,
            timeout: 30000
          };
          ok = false;
          return _this.currentReq = request(opts).on('response', function(res) {
            log.debug('long poll response', res.statusCode, res.statusMessage);
            if (res.statusCode === 200) {
              return ok = true;
            } else if (isUnknownSID(res)) {
              ok = false;
              log.debug('sid became invalid');
              _this.sid = null;
              _this.gsid = null;
              _this.subscribed = false;
            }
            return rj(NetworkError.forRes(res));
          }).on('data', function(chunk) {
            if (ok) {
              _this.pushParser.parse(chunk);
            }
            if (!_this.subscribed) {
              return _this.subscribe();
            }
          }).on('error', function(err) {
            log.debug('long poll error', err);
            return rj(err);
          }).on('end', function() {
            log.debug('long poll end');
            return rs();
          });
        };
      })(this));
    };

    Channel.prototype.subscribe = function() {
      if (this.subscribed) {
        return;
      }
      this.subscribed = true;
      return Q().then(function() {
        return wait(1000);
      }).then((function(_this) {
        return function() {
          var opts, timestamp;
          timestamp = Date.now() * 1000;
          opts = {
            method: 'POST',
            uri: op('channel/bind'),
            jar: request.jar(_this.jarstore),
            proxy: _this.proxy,
            qs: {
              VER: 8,
              RID: 81188,
              ctype: 'hangouts',
              gsessionid: _this.gsid,
              SID: _this.sid
            },
            headers: _this.authHeaders(),
            timeout: 30000,
            form: {
              count: 3,
              ofs: 0,
              req0_p: '{"1":{"1":{"1":{"1":3,"2":2}},"2":{"1":{"1":3,"2":' + '2},"2":"","3":"JS","4":"lcsclient"},"3":' + timestamp + ',"4":0,"5":"c1"},"2":{}}',
              req1_p: '{"1":{"1":{"1":{"1":3,"2":2}},"2":{"1":{"1":3,"2":' + '2},"2":"","3":"JS","4":"lcsclient"},"3":' + timestamp + ',"4":' + timestamp + ',"5":"c3"},"3":{"1":{"1":"babel"}}}',
              req2_p: '{"1":{"1":{"1":{"1":3,"2":2}},"2":{"1":{"1":3,"2":' + '2},"2":"","3":"JS","4":"lcsclient"},"3":' + timestamp + ',"4":' + timestamp + ',"5":"c4"},"3":{"1":{"1":"hangout_invite"}}}'
            }
          };
          return req(opts);
        };
      })(this)).then(function(res) {
        var ok;
        if (res.statusCode === 200) {
          return log.debug('subscribed channel');
        } else if (isUnknownSID(res)) {
          ok = false;
          log.debug('sid became invalid');
          this.sid = null;
          this.gsid = null;
          this.subscribed = false;
        }
        return Q.reject(NetworkError.forRes(res));
      }).fail((function(_this) {
        return function(err) {
          log.info('subscribe failed', fmterr(err));
          _this.subscribed = false;
          return Q.reject(err);
        };
      })(this));
    };

    return Channel;

  })();

}).call(this);

//# sourceMappingURL=channel.js.map
