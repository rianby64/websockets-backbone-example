(function (factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD
    define(['underscore', 'backbone'], factory);
  } else if (typeof exports !== 'undefined') {
    // CommonJS / Node.js
    module.exports = factory(require('underscore'), require('backbone'));
  } else {
    // globals
    factory(_, Backbone);
  }
}(function (_, Backbone) {

  var sync = function(method, model, options) {
    function urlError() { throw new Error('A "url" property or function must be specified'); }
    function wsError() { throw new Error('A "ws" property or function must be specified'); }

    var params = {
      collection: (model.collection == undefined) ? model : model.collection,
      model: (model instanceof Backbone.Model) ? model : undefined,
      method: method,
      sent: false,
      data: (method == 'update') ? (model.changed) : (options.attrs || model.toJSON(options))
    }
    
    if (!options.url) params.url =  _.result(model, 'url') || urlError();
    if (!options.curl) params.curl = (model instanceof Backbone.Collection) ? 
      _.result(model, 'url') : (model.collection == undefined) ? '' : _.result(model.collection, 'url');
    if (!options.ws) params.ws = ((model.collection == undefined) ? _.result(model, 'ws') : _.result(model.collection, 'ws')) || wsError();

    var ws = Backbone.websocket(_.extend(params, options));
    model.trigger('request', model, ws, options);
    return ws;
  }

  var websocket = function( options ) {
    options = options || {};
    var params = {
      url: _.result(options, 'url'),
      curl: _.result(options, 'curl'),
      method: _.result(options, 'method'),
      cast: _.result(options, 'cast'),
      data: _.result(options, 'data') || []
    }, ws = options.ws;

    if (!options.params) options.params = params;
    else options.params = _.defaults(options.params, params);
    if (!ws.queue) ws.queue = []; // process any request in the queue FIFO
    ws.queue.push(options);
    
    if (ws.onopen == null) { ws.onopen = open; } // bind->open
    else if (ws.readyState == 1) { queue(); } // call->queue

    // bind->open
    function open(event) {
      queue(); // call->queue
    }
    // bind->queue
    function queue(index) {
      index = index || 0;
      if (index >= ws.queue.length) return;
      if (ws.queue[index].sent) {}
      else {
        ws.queue[index].sent = true; // mark it as sent
        ws.onmessage = send; // bind->send
        ws.send(JSON.stringify(ws.queue[index++].params)); // call->send
      }
      queue(index);
    }
    // bind->send
    function send(data) {
      done(data); // call->done
    }
    // call->done
    function done(response) {
      var packet = JSON.parse(response.data);
      if (ws.queue.length == 0) {
        if (packet.method == 'update') {
          model = (options.collection instanceof Backbone.Collection) ? options.collection.get(packet.data.id) : options.model;
          model.set(packet.data);
        }
        else if (packet.method == 'create') {
          collection = options.collection;
          if (collection instanceof Backbone.Collection) {
            created = new collection.model(packet.data, { collection: collection });
            collection.add(created);
          }
        }
        else if (packet.method == 'delete') {
          collection = options.collection;
          if (collection instanceof Backbone.Collection) {
            model = options.collection.get(packet.data.id);
            collection.remove(model);
          }
        }
        return;
      }
      for (var index = 0; function() {
        if (index >= ws.queue.length) return false;
        if (ws.queue[index].sent) {
          ws.queue[index].success(packet.data);
          ws.queue = ws.queue.slice(index + 1, ws.queue.length);
          index--;
        }
        return true;
      }(); index++ );
    }
    return ws;
  }

  //Exports
  Backbone.sync = sync;
  Backbone.websocket = websocket;

  return Backbone;
}));
