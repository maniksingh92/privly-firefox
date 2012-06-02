/*******************************************************************************
Open Source Initiative OSI - The MIT License (MIT):Licensing
[OSI Approved License]
The MIT License (MIT)

Copyright (c) Sean McGregor

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.

*******************************************************************************/



/**
 *
 * For a high level overview of what this script does, see:
 * http://www.privly.org/content/core-functionality-privlyjs
 *
 ***HOST PAGE CONFIGURATION***
 *
 * The host page can influence the behaviour of this script by including
 * privly-exclude="true" as an attribute on either the body element,
 * or an individual link element. If the body has the privly-exclude attribute:
 *
 * <body privly-exclude="true">
 *
 * Then the script will only respond to resize messages.
 *
 * If a link has the attribute, as in here:
 *
 * <a href="https://example.com" privly-exclude="true">
 *
 * Then it is not replaced with the referenced content.
 *
 *
 ****URL PARAMETERS***
 *
 * The script also responds to parameters
 * and anchors on the URL.
 *
 * burntAfter: specifies a time in seconds in the Unix epoch
 * until the content is likely destroyed on the remote server
 * Destruction of the content should result in a change of message,
 * but not a request to the remote server for the content
 *
 * burntMessage: Display this message if the content was burnt, as
 * indicated by the burnAfter parameter.
 *
 * passiveMessage: Display this message when the extension is in
 * passive mode.
 *
 * passive: Forces the link into passive mode
 * exclude: Force the link to not be replaced or put into passive
 * mode
 *
 **/
var privly = {
  
  //These messages are displayed to users. These strings cannot be in this
  //script when we start localization.
  messages: {
    sleepMode: "Privly is in sleep mode so it can catch up with " +
      "demand. The content may still be viewable by clicking this link",
    passiveModeLink: "Read in Place",
    contentExpired: "The content behind this link likely expired. Click the link to check.",
    privlyContent: "Privly Content: ",
    injectableContent: "Injectable Content: ",
    burntPrivlyContent: "Burnt Privly Content: "
  },
  
  // Gives a map of the URL parameters and the anchor
  // Example:
  // var url = https://priv.ly/posts/1?example=Hello#World
  // privly.getUrlVariables(url)["example"] is "Hello"
  // privly.getUrlVariables(url)["anchor"] is "World"
  getUrlVariables: function(url) {
      var vars = {};
      if (url.indexOf("#",0) > 0)
      {
        var anchor = url.substring(url.indexOf("#",0) + 1, url.length);
        vars.anchor = anchor;
        url = url.split("#",1)[0];
      }
      url = url.replace("&amp;", "&");
      var parts = url.replace(/[?&]+([^=&]+)=([^&]*)/gi,
        function(m,key,value) {
          vars[key] = value;
      });
      return vars;
  },
  
  // The Privly RegExp determines which links are eligible for
  // replacing with their referenced content.
  // This system will need to change so we can move to a white
  // list approach. See: http://www.privly.org/content/why-privly-server
  //
  // Matches:
  //              http://
  //              https://
  //                        DOMAIN/number
  //
  //                                  ?any_number_of_parameters=value#anchors
  privlyReferencesRegex: new RegExp("\\b(https?:\\/\\/){0,1}(" +
    "priv\\.ly\\/posts\\/\\d+|" +
    "dev\\.privly\\.org\\/posts\\/\\d+|" +
    "privly\\.org\\/posts\\/\\d+|" +
    "privly\\.com\\/posts\\/\\d+|" +
    "dev\\.privly\\.com\\/posts\\/\\d+|" +
    "localhost:3000\\/posts\\/\\d+" +
    ")(\\b|\\?(\\S)*|#(\\S)*)$","gi"),
    //the final line matches
    //end of word OR
    //the parameter string to the end of the word OR
    //the anchor string to the end of the word
  
  // enum to hold various extension modes and their value.
  // extension modes are set through firefox's extension api.
  // https://developer.mozilla.org/en/Code_snippets/Preferences
  extensionModeEnum : {
    ACTIVE : 0,
    PASSIVE : 1,
    CLICKTHROUGH : 2
  },
  
  //indicates whether the extension shoud immediatly replace all Privly
  //links it encounters
  extensionMode: 0,
  
  // Takes a domain with an optional http(s)
  // in front and returns a fully formed domain name
  makeHref: function(domain)
  {
    var hasHTTPRegex = /^((https?)\:\/\/)/i;
    if (!hasHTTPRegex.test(domain)) {
      domain = "http://" + domain;
    }
    return domain;
  },
  
  //Make plain text links into anchor elements
  createLinks: function()
  {
      /***********************************************************************
      Inspired by Linkify script:
        http://downloads.mozdev.org/greasemonkey/linkify.user.js
        
      Originally written by Anthony Lieuallen of http://arantius.com/
      Licensed for unlimited modification and redistribution as long as
      this notice is kept intact.
      ************************************************************************/
      
      var excludeParents = ["a", "applet", "button", "code", "form",
                             "input", "option", "script", "select", "meta",
                             "style", "textarea", "title", "div","span"];
      var excludedParentsString = excludeParents.join(" or parent::");
      var xpathExpression = ".//text()[not(parent:: " +
          excludedParentsString +")]";
          
      var textNodes = document.evaluate(xpathExpression, document.body, null,
          XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE, null);
          
      for (var i=0; i < textNodes.snapshotLength; i++){
          var item = textNodes.snapshotItem(i);
          
          var itemText = item.nodeValue;
          
          privly.privlyReferencesRegex.lastIndex = 0;
          if (privly.privlyReferencesRegex.test(itemText)){
              var span = document.createElement("span");
              var lastLastIndex = 0;
              privly.privlyReferencesRegex.lastIndex = 0;
              
              var results = privly.privlyReferencesRegex.exec(itemText);
              while ( results ){
                  span.appendChild(document.createTextNode(
                    itemText.substring(lastLastIndex, results.index)));
                    
                  var rawHref = results[0];
                  var text = (rawHref.indexOf(" ") === 0)?rawHref.substring(1):rawHref;
                  
                  var href = privly.makeHref(text);
                  
                  var a = document.createElement("a");
                  a.setAttribute("href", href);
                  a.appendChild(document.createTextNode(
                    text.substring(0,4).toLowerCase() + text.substring(4)));
                  if (href.indexOf(" ") === 0) {
                    span.appendChild(document.createTextNode(" "));
                  }
                  span.appendChild(a);
                  lastLastIndex = privly.privlyReferencesRegex.lastIndex;
                  results = privly.privlyReferencesRegex.exec(itemText);
              }
              span.appendChild(document.createTextNode(
                itemText.substring(lastLastIndex)));
              item.parentNode.replaceChild(span, item);
          }
      }
  },
  
  //Kill default link behaviour on Privly Links
  makePassive: function(e)
  {
    //Preventing the default link behavior
    e.cancelBubble = true;
    e.stopPropagation();
    e.preventDefault();
    privly.replaceLink(e.target);
  },
  
  //Checks link attributes and text for privly links without the proper href
  //attribute. Twitter and other hosts change links so they can collect
  //click events.
  correctIndirection: function()
  {
    var anchors = document.links;
    var i = anchors.length;
    while (i--){
      var a = anchors[i];
      
      privly.privlyReferencesRegex.lastIndex = 0;
      if (a.href && !privly.privlyReferencesRegex.test(a.href))
      {
        //check if Privly is in the body of the text
        privly.privlyReferencesRegex.lastIndex = 0;
        if (privly.privlyReferencesRegex.test(a.innerHTML)) {
          // If the href is not present or is on a different domain
          privly.privlyReferencesRegex.lastIndex = 0;
          var results = privly.privlyReferencesRegex.exec(a.innerHTML);
          var newHref = privly.makeHref(results[0]);
          a.setAttribute("href", newHref);
        }
        
        //check if Privly was moved to another attribute
        for (var y = 0; y < a.attributes.length; y++) {
          var attrib = a.attributes[y];
          if (attrib.specified === true) {
            privly.privlyReferencesRegex.lastIndex = 0;
            if (privly.privlyReferencesRegex.test(attrib.value)) {
              a.setAttribute("href", attrib.value);
            }
          }
        }
      }
      privly.privlyReferencesRegex.lastIndex = 0;
    }
  },
  
  nextAvailableFrameID: 0,
  
  // Replace an anchor element with its referenced content.
  replaceLink: function(object)
  {
    var iFrame = document.createElement('iframe');
    iFrame.setAttribute("frameborder","0");
    iFrame.setAttribute("vspace","0");
    iFrame.setAttribute("hspace","0");
    iFrame.setAttribute("name","privlyiframe");
    iFrame.setAttribute("width","100%");
    iFrame.setAttribute("marginwidth","0");
    iFrame.setAttribute("marginheight","0");
    iFrame.setAttribute("height","1px");
    
    var iframeUrl = object.href;
    
    if (object.href.indexOf("?") > 0){
      iframeUrl = iframeUrl.replace("?",".iframe?frame_id="+
        privly.nextAvailableFrameID+"&");
      iFrame.setAttribute("src",iframeUrl);
    }
    else if (object.href.indexOf("#") > 0)
    {
      iframeUrl = iframeUrl.replace("#",".iframe?frame_id="+
        privly.nextAvailableFrameID+"#");
      iFrame.setAttribute("src",iframeUrl);
    }
    else
    {
      iFrame.setAttribute("src",object.href + ".iframe?frame_id=" +
        privly.nextAvailableFrameID);
    }
    iFrame.setAttribute("id","ifrm"+privly.nextAvailableFrameID);
    iFrame.setAttribute("frameborder","0");
    privly.nextAvailableFrameID++;
    iFrame.setAttribute("style","width: 100%; height: 32px; " +
      "overflow: hidden;");
    iFrame.setAttribute("scrolling","no");
    iFrame.setAttribute("overflow","hidden");
    object.parentNode.replaceChild(iFrame, object);
  },
  
  //Process a link according to its parameters and whitelist status
  //if the link is in active mode and is whitelisted, it will replace
  //the link with the referenced content. If the link is in passive mode
  //or it is not a whitelisted link, the link will be clickable to replace
  //the content.
  processLink: function(anchorElement, whitelist)
  {
    var exclude = anchorElement.getAttribute("privly-exclude");
    var params = privly.getUrlVariables(anchorElement.href);
    
    if (!exclude && params.exclude === undefined){
      
      var passive = this.extensionMode === privly.extensionModeEnum.PASSIVE ||
        params.passive !== undefined || !whitelist;
      var burnt = params.burntAfter !== undefined && parseInt(params.burntAfter, 10) <
        Date.now()/1000;
      var active = this.extensionMode === privly.extensionModeEnum.ACTIVE &&
        whitelist;
      var sleepMode = this.extensionMode === privly.extensionModeEnum.CLICKTHROUGH &&
        whitelist;
      
      if (!whitelist){
        anchorElement.innerHTML = privly.messages.injectableContent +
          privly.messages.passiveModeLink;
        anchorElement.addEventListener("mousedown",privly.makePassive,true);
      }
      else if (passive){
        if (params.passiveMessage !== undefined)
        {
          var passiveMessage = params.passiveMessage.replace(/\+/g, " ");
          anchorElement.innerHTML = privly.messages.privlyContent + passiveMessage;
        }
        else
        {
          anchorElement.innerHTML = privly.messages.privlyContent +
            privly.messages.passiveModeLink;
        }
        anchorElement.addEventListener("mousedown",privly.makePassive,true);
      }
      else if (burnt)
      {
        if (params.burntMessage !== undefined)
        {
          var burntMessage = params.burntMessage.replace(/\+/g, " ");
          anchorElement.innerHTML = privly.messages.burntPrivlyContent + burntMessage;
        }
        else
        {
          anchorElement.innerHTML = privly.messages.contentExpired;
        }
        anchorElement.setAttribute('target','_blank');
        anchorElement.addEventListener("mousedown", privly.makePassive, true);
      }
      else if (active){
        this.replaceLink(anchorElement);
      }
      else if (sleepMode){
        anchorElement.innerHTML = privly.messages.sleepMode;
        anchorElement.setAttribute('target','_blank');
        anchorElement.removeEventListener("mousedown", privly.makePassive, true);
      }
    }
  },
  
  //Replace all Privly links with their iframe or
  //a new link, which when clicked will be replaced
  //by the iframe
  replaceLinks: function()
  {
    var elements = document.getElementsByTagName("privModeElement");
    if (elements.length > 0){
      this.extensionMode = parseInt(elements[0].getAttribute('mode'), 10);
    }
    var anchors = document.links;
    var i = anchors.length;
    
    while (--i >= 0){
      var a = anchors[i];
      this.privlyReferencesRegex.lastIndex = 0;
      if (a.href && this.privlyReferencesRegex.test(a.href))
      {
        privly.processLink(a, true);
      }
      else if (a.href && a.href.indexOf("#INJECTCONTENT0",0) > 0)
      {
        privly.processLink(a, false);
      }
    }
  },
  
  //resize the iframe using a posted message
  resizeIframe: function(message){
    
    if (message.origin !== "https://priv.ly" &&
      message.origin !== "http://localhost:3000" &&
      message.origin !== "http://dev.privly.org" &&
      message.origin !== "http://dev.privly.com" &&
      message.origin !== "https://privly.org" &&
      message.origin !== "https://privly.com") {
        return;
    }
    
    var data = message.data.split(",");
    
    var iframe = document.getElementById("ifrm"+data[0]);
    iframe.style.height = data[1]+'px';
  },
  
  //prevents DOMNodeInserted from sending hundreds of extension runsmake
  runPending: false,
  
  //prep the page and replace the links if it is in active mode
  run: function()
  {
    //create and correct the links pointing
    //to Privly content
    privly.createLinks();
    privly.correctIndirection();
    
    //replace all available links on load, if in active mode,
    //otherwise replace all links default behavior
    privly.replaceLinks();
  },
  
  //runs privly once then registers the update listener
  //for dynamic pages
  listeners: function(){
    //The content's iframe will post a message to the hosting document.
    //This listener sets the height  of the iframe according to the messaged
    //height
    window.addEventListener("message", privly.resizeIframe, false, true);
    
    //respect the settings of the host page.
    //If the body element has privly-exclude=true
    if (document.getElementsByTagName("body")[0]
        .getAttribute("privly-exclude")==="true")
    {
      return;
    }
    else
    {
      privly.runPending=true;
      setTimeout(
        function(){
          privly.runPending=false;
          privly.run();
        },
        100);
        
      //Everytime the page is updated via javascript, we have to check
      //for new Privly content. This might not be supported on other platforms
      document.addEventListener("DOMNodeInserted", function(event) {
        //we check the page a maximum of two times a second
        if (privly.runPending) {
          return;
        }
        
        privly.runPending=true;
        
        setTimeout(
          function(){
            privly.runPending=false;
            privly.run();
          },
          500);
      });
    }
  },
  
  // cross platform onload event
  // won't attach anything on IE
  // on macintosh systems.
  addEvent: function(obj, evType, fn){
    if (obj.addEventListener){
      obj.addEventListener(evType, fn, false);
      return true;
    }
    else if (obj.attachEvent){
      var r = obj.attachEvent("on"+evType, fn);
      return r;
    }
    else {
      return false;
    }
  }
};

privly.addEvent(window, 'load', privly.listeners);
