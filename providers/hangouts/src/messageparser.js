// Generated by CoffeeScript 1.10.0
(function() {
  var CLIENT_EVENT_PARTS, CLIENT_STATE_UPDATE, MessageParser, Q, log, tryparse,
    bind = function(fn, me){ return function(){ return fn.apply(me, arguments); }; };

  log = require('bog');

  Q = require('q');

  tryparse = require('./util').tryparse;

  CLIENT_STATE_UPDATE = require('./schema').CLIENT_STATE_UPDATE;

  CLIENT_EVENT_PARTS = ['chat_message', 'membership_change', 'conversation_rename', 'hangout_event'];

  module.exports = MessageParser = (function() {
    function MessageParser(emitter) {
      this.emitter = emitter;
      this.emit = bind(this.emit, this);
      this.parsePayload = bind(this.parsePayload, this);
      this.parsePushLine = bind(this.parsePushLine, this);
      this.parsePushLines = bind(this.parsePushLines, this);
    }

    MessageParser.prototype.parsePushLines = function(lines) {
      var i, len, line;
      for (i = 0, len = lines.length; i < len; i++) {
        line = lines[i];
        this.parsePushLine(line);
      }
      return null;
    };

    MessageParser.prototype.parsePushLine = function(line) {
      var data, i, len, obj, ref, ref1, ref2, sub;
      for (i = 0, len = line.length; i < len; i++) {
        sub = line[i];
        data = sub != null ? (ref = sub[1]) != null ? ref[0] : void 0 : void 0;
        if (data) {
          if (data === 'noop') {
            this.emit('noop');
          } else if (data.p != null) {
            obj = tryparse(data.p);
            if ((obj != null ? (ref1 = obj['3']) != null ? ref1['2'] : void 0 : void 0) != null) {
              this.emit('clientid', obj['3']['2']);
            }
            if ((obj != null ? (ref2 = obj['2']) != null ? ref2['2'] : void 0 : void 0) != null) {
              this.parsePayload(obj['2']['2']);
            }
          }
        } else {
          log.debug('failed to parse', line);
        }
      }
      return null;
    };

    MessageParser.prototype.parsePayload = function(payload) {
      var i, len, ref, results, u, update;
      if (typeis(payload, 'string')) {
        payload = tryparse(payload);
      }
      if (!payload) {
        return;
      }
      if ((payload != null ? payload[0] : void 0) === 'cbu') {
        ref = payload[1];
        results = [];
        for (i = 0, len = ref.length; i < len; i++) {
          u = ref[i];
          update = CLIENT_STATE_UPDATE.parse(u);
          results.push(this.emitUpdateParts(update));
        }
        return results;
      } else {
        return log.info('ignoring payload', payload);
      }
    };

    MessageParser.prototype.emitUpdateParts = function(update) {
      var _, eventname, header, k, ref, ref1, results, value;
      header = update.state_update_header;
      results = [];
      for (k in update) {
        value = update[k];
        ref1 = (ref = k.match(/(.*)_notification/)) != null ? ref : [], _ = ref1[0], eventname = ref1[1];
        if (!(eventname && value)) {
          continue;
        }
        if (eventname === 'event') {
          results.push(this.emitEventParts(header, value.event));
        } else {
          value._header = header;
          results.push(this.emit(eventname, value));
        }
      }
      return results;
    };

    MessageParser.prototype.emitEventParts = function(header, event) {
      var i, ks, len, part, results;
      results = [];
      for (i = 0, len = CLIENT_EVENT_PARTS.length; i < len; i++) {
        part = CLIENT_EVENT_PARTS[i];
        if (!event[part]) {
          continue;
        }
        ks = filter(keys(event), function(k) {
          return event[k] && (k === part || !contains(CLIENT_EVENT_PARTS, k));
        });
        results.push(this.emit(part, pick(event, ks)));
      }
      return results;
    };

    MessageParser.prototype.emit = function(ev, data) {
      var ref;
      return (ref = this.emitter) != null ? ref.emit(ev, data) : void 0;
    };

    return MessageParser;

  })();

}).call(this);

//# sourceMappingURL=messageparser.js.map