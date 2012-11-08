$(function(){
  var mqttSocket = new Mosquitto();


  // Backbone.View.prototype.close = function(){
  //   this.remove();
  //   this.unbind();
  //   if (this.onClose){ // Provide custom functionality to remove event bindings in subclasses
  //     this.onClose();
  //   }
  // }

  Backbone.View.prototype.close = function() {
    console.log("closing view");

    this.off();
    this.remove();

    // For custom handlers to clean up events bound to anything else than this.model and this.collection
    if (this.onClose){ 
      this.onClose();
    }

    if (this.model) {
      console.log("removing all event handlers this view has on its model");
      this.model.off(null, null, this);
    }

    if (this.collection) {
      console.log("removing all event handlers this view has on its collection");
      this.collection.off(null, null, this);
    }
  }



  /*
   *
   *  MODELS
   *
   */

  var Status = Backbone.Model.extend({
    defaults: function () {
      return {
        connectionStatus: "disconnected", 
        broker: "ws://127.0.0.1/mqtt" 
      };
    },
  });


  var Control = Backbone.Model.extend({
    defaults: function() {
      return {
        value: 0,
        type: "undefined",
        topic: null              
      };
    },
  });

  var Device = Backbone.Model.extend({
    defaults: function() {
      return {
        name: "",
        room: undefined
      };
    },

    initialize: function() {
      this.controls = new ControlCollection;
    },

    removeFromCurrentRoom: function() {
      if (this.room != undefined && this.room != null) {
        console.log("removing device from room: " + this.room.id);
        this.room.devices.remove(this);


        if (this.room.devices.length == 0) {

          console.log("Room " + this.room.id+" is empty, removing it");
          Rooms.remove(this.room);
        }


      } 
    },

    moveToRoom: function(roomName) {
      var cleanedName = roomName || "unassigned";
      var room = Rooms.get(cleanedName);
    
      if (room == null) {
        console.log("room " + cleanedName +" does not exist");
        room = new Room({id: cleanedName});
        Rooms.add(room);
      } 

      this.removeFromCurrentRoom();
      
      room.devices.add(this);
      this.room = room;
      console.log("device added to room: " + cleanedName);
    },
  });


  var Room = Backbone.Model.extend({
    initialize: function() {
      this.devices = new DeviceCollection;
    },
  });


  var DeviceCollection = Backbone.Collection.extend({
    model: Device,
  });

  var RoomCollection = Backbone.Collection.extend({
    model: Room,
  });

  var ControlCollection = Backbone.Collection.extend({
    model: Control,
  });

  /*
   *
   *  VIEWS
   *
   */

  var ToplevelView = Backbone.View.extend({
    rerenderToplevelView: function() {
      App.renderToplevelView(this);
    },
  })

  var SettingsView = ToplevelView.extend({
    template: $("#settings-template").html(),

    initialize: function() {
      this.model.view = this; 
      this.model.on('change', this.render, this);
    },


    render: function () {
        var tmpl = _.template(this.template);
        this.$el.html(tmpl(this.model.toJSON()));
        return this;
    },
   });




  var RoomListView = ToplevelView.extend({
    idName: "room-list", 
    tagName: "div",
    template: $("#room-list-template").html(),

    initialize: function() {
        this.model.on('add', this.addRoom, this);
        this.model.on('remove', this.removeRoom, this);
        _.bindAll(this, 'addRoom', 'removeRoom', 'render');

    },

    addRoom: function(room) {
      console.log("Room added: " + room.get("id"));
      var detailViewLink = new RoomDetailLinkView({model: room});
      this.$('#room-detail-links').append(detailViewLink.render().$el);
    },

    render: function () {
        var tmpl = _.template(this.template);
        this.$el.html(tmpl());

        // According to http://jsperf.com/backbone-js-collection-iteration for iteration with collection.models is pretty fast
        console.log("number of rooms: " + this.model.length);
        for (var i = 0, l = this.model.length; i < l; i++) {
            this.addRoom(this.model.models[i]);
        }

        return this;
    },
    removeRoom: function(room) {
      console.log("room removed, removing detail link view");
       room.detailViewLink.close();
    },



  });



   var RoomDetailLinkView = Backbone.View.extend({
    className: "room-detail-link", 
    tagName: "li",
    template: $("#room-detail-link-template").html(),

    initialize: function() {
      this.model.detailViewLink = this; 

    },

    render: function () {
        var tmpl = _.template(this.template);
        this.$el.html(tmpl(this.model.toJSON()));
        return this;
    },

 


   });



  var ViewPlaceholder = Backbone.View.extend({
    template: $("#view-placeholder-template").html(),
    className: "view", 

    initialize: function() {
      this.model.on('add', this.addModel, this);
    },

    render: function () {
        var tmpl = _.template(this.template);
       this.$el.html(tmpl(_.extend(this.model.toJSON(), {id: this.id, backText: this.options.backText, backHref: this.options.backHref})));
        return this;
    },

    addModel: function(addedObject) {
      if(addedObject.get("id") == this.id) {
        console.log("view content now available, re routing to: " + this.options.callbackRoute);
        Backbone.history.loadUrl( this.options.callbackRoute ) // Router.navigate does not work to reload route, as the hash did not change
      }
    },
  });


  var RoomDetailViewPlaceholder = Backbone.View.extend({
    template: $("#room-detail-placeholder-template").html(),
    className: "room", 

    initialize: function() {
      this.model.on('add', this.addRoom, this);
    },

    render: function () {
        var tmpl = _.template(this.template);
          this.$el.html(tmpl({id: this.id}));
        return this;
    },

    addRoom: function(room) {
      if(room.get("id") == this.id) {
        Router.room(this.id);
      }
    },
  });



  var RoomDetailView = ToplevelView.extend({
    template: $("#room-detail-template").html(),
    className: "room", 

    initialize: function() {
      this.model.devices.on('add', this.addDevice, this);
      this.model.devices.on('remove', this.removeDevice, this);
      this.model.bind('remove', this.remove, this);
      this.model.view = this;
    },

    onClose: function() {
      this.model.devices.off();
    },

    render: function () {
        var tmpl = _.template(this.template);
        this.$el.html(tmpl(this.model.toJSON()));
        for (var i = 0, l = this.model.devices.length; i < l; i++) {
            this.addDevice(this.model.devices.models[i]);
        }

        return this;
    },

    addDevice: function(device) {

      var deviceView = new DeviceView({model: device});
      this.$(".devices").append(deviceView.render().el);
    },


    removeDevice: function(device) {
      console.log("removing device from room: "+ device.get('id') + " " + this.model.get('id'))
      console.log()
      device.view.close();
      // $(device.view.el).unbind();
      // $(device.view.el).remove();

      if (this.model.devices.length == 0) {
        console.log("Room is empty, removing it");
        Rooms.remove(this.model);

      }
    },
  });


  var ControlView = Backbone.View.extend({
    className: "control",

    events: {
      "click input[type=checkbox]":  "checkboxChanged",
      "change input[type=range]":    "rangeChanged",
      "mousedown input[type=range]": "inhibitRangeUpdates",
      "mouseup input[type=range]":   "allowRangeUpdates"

    },

    inhibitRangeUpdates: function() {
      this.allowrangeupdates = false; 
    },    

    allowRangeUpdates: function() {
      this.allowrangeupdates = true; 
    },


     initialize: function() {
      _.bindAll(this, 'checkboxChanged');
      this.model.on('change:type', this.render, this);
      this.model.on('change:value', this.updateControl, this);
      this.allowRangeUpdates(); 
      this.model.view = this;
    },

    render: function() {
      var tmpl = _.template($("#" + this.model.get("type") +"-control-template").html());
      this.$el.html(tmpl(_.extend(this.model.toJSON(), {checkedAttribute: this.model.get("value") == 1 ? "checked=\"true\"" : ""})));
      return this;
    },

    updateControl: function(model) {

      if(model.get("type") == "switch" ) {
        // this.$("input").attr('checked', model.get("value") == 1);
        this.render();
      } else if( model.get("type") == "range" && this.allowrangeupdates) {
        console.log("model value changed, updating range slider with value: " + this.model.get("value"));
                this.render();

        // this.$("input").val(this.model.get("value"));     
      }
    },


    rangeChanged: function(event) {
              console.log("range slider value changed to " + event.srcElement.value +", publishing it");

      mqttSocket.publish(this.model.get("topic"), event.srcElement.value, 0, true);

    },

    checkboxChanged: function(event) {
      mqttSocket.publish(this.model.get("topic"), event.srcElement.checked == 0 ? "0" : "1", 0, true);
    }

  });


  var DeviceSettingsView = ToplevelView.extend({
    template: $("#device-settings-template").html(),
    className: "device-settings",


    events: {
      "keypress #nameInput"  : "publishNameInputOnEnter",
      "keypress #roomInput"  : "publishRoomInputOnEnter",
    },

    initialize: function() {
      this.model.on('change', this.rerenderToplevelView, this);
      this.model.view = this;
    },  


    render: function() {
      console.log("reredering room");
      var tmpl = _.template(this.template);
      var roomName = this.model.get("room") != undefined ? this.model.room.get("id") : "unassigned"
      this.$el.html(tmpl(_.extend( this.model.toJSON(), {roomname: roomName, rooms: Rooms})));
      this.delegateEvents();
      return this;
    },

    publishValue: function(e, type) {
      var value = e.srcElement.value;
      mqttSocket.publish("/devices/"+this.model.get("id")+"/meta/"+type, value ? value : "", 0, true);
    },

    publishNameInput: function(e) {
      this.publishValue(e, "name");
    },

    publishRoomInput: function(e) {
      this.publishValue(e, "room");
    },

    publishNameInputOnEnter: function(e) { // enter in nameInput
      if (e.keyCode == 13) this.publishNameInput(e);
    },
    publishRoomInputOnEnter: function(e) { // enter in nameInput
      if (e.keyCode == 13) this.publishRoomInput(e);
    },
  });

  var DeviceView = Backbone.View.extend({
    template: $("#device-template").html(),
    className: "device", 

    initialize: function() {
      console.log("new DeviceView created for: " + this.model.id);
      this.model.on('change', this.render, this);
      this.model.on('destroy', this.remove, this);
      this.model.controls.on('add', this.addControl, this);
      this.model.view = this;
    },  

    render: function() {
      var tmpl = _.template(this.template);
      this.$el.html(tmpl(this.model.toJSON()));
        for (var i = 0, l = this.model.controls.length; i < l; i++) {
            this.addControl(this.model.controls.models[i]);
        }

      return this;
    },

    addControl: function(control) {
      var controlView = new ControlView({model: control});
      this.$(".controls").append(controlView.render().el);
    },



  });



  // Manages view transition 
  var AppView = Backbone.View.extend({
    el: $("#container"),

    showView: function(view) {
      if (this.currentView){
        this.currentView.close();
      }

      this.currentView = view;
      this.renderToplevelView(this.currentView);
    },

    renderToplevelView: function(view) {
      console.log("renderToplevelView");
      this.$el.html(view.render().$el);
                          view.delegateEvents();

    },

  });


  /*
   *
   *  BASE APPLICATION LOGIC & MQTT EVENT HANDLING
   *
   */

  var ApplicationRouter = Backbone.Router.extend({
  routes: {
    "settings" : "settings",
    "devices/:device/settings": "deviceSettings",
    "rooms/:room": "room",
    "": "index",
    "/": "index",


  },
  initialize: function() {console.log("Router inizalized");},

  index: function() {
    console.log("showing roomListView");

    var roomListView = new RoomListView({model: Rooms});
    App.showView(roomListView);
  },

  settings: function () {
    var settingsView = new SettingsView({model: Settings});
    App.showView(settingsView);
  },

  deviceSettings: function(id) {
    console.log("device settings");
    var device = Devices.get(id); // Room might not yet exists
    var view; 
    if (device == null) {
      view = new ViewPlaceholder({model: Devices, id: id, backText: "Home", backHref: '#', callbackRoute: Backbone.history.fragment});
    } else {
      view = new DeviceSettingsView({model: device});
    }
    App.showView(view);

  },


  room: function(id) {
    console.log("showing roomDetailView for room: " + id);
    var room = Rooms.get(id); // Room might not yet exists
    var view; 
    if (room == null) {
      view = new ViewPlaceholder({model: Rooms, id: id, backText: 'Rooms', backHref: '#', callbackRoute: Backbone.history.fragment});
    } else {
      view = new RoomDetailView({model: room});
    }
    App.showView(view);

   },




});



  mqttSocket.onconnect = function(rc){
    console.log("Connection established");
    // Status.set("connectionStatus", "connected");
    mqttSocket.subscribe('/devices/#', 0);
  };

  mqttSocket.ondisconnect = function(rc){ 
    // Status.set("connectionStatus", "disconnected");
    console.log("Connection terminated");
  };

  mqttSocket.onmessage = function(topic, payload, qos){

    console.log("-----------RECEIVED-----------");
    console.log("Received: "+topic+":"+payload);    
    var splitTopic = topic.split("/");

    // Ensure the device for the message exists
    var deviceId = splitTopic[2]
    var device = Devices.get(deviceId);
    if (device == null) {
      device = new Device({id: deviceId});
      Devices.add(device);
      device.moveToRoom(undefined);
    }

    // Topic parsing
    if(splitTopic[3] == "controls") {
      var controlName = splitTopic[4];  
      var control = device.controls.get(controlName);
      if (control == null) {
        control = new Control({id: controlName});
        device.controls.add(control);

        control.set("topic", topic.replace("/type", ""));

      }

      if(splitTopic[5] == null) {                                       // Control value
        control.set("value", payload);
      } else {                                                          // Control type 
        control.set("type", payload);
      } 
    } else if(splitTopic[3] == "meta" ) { 
      if (splitTopic[4] == "room") {                                    // Device Room
        device.moveToRoom(payload);
      } else if(splitTopic[4] == "name") {                              // Device name
        device.set('name', payload);
      }
      device.set(splitTopic[4], payload);
    }
    console.log("-----------/ RECEIVED-----------");
  };







  var Settings = new Status;
  var Devices = new DeviceCollection;
  var Rooms = new RoomCollection;
  var App = new AppView;

  var Router = new ApplicationRouter;
  Backbone.history.start({pushState : false});

  mqttSocket.connect("ws://192.168.8.45/mqtt");

});
