/* TiddlyWiki: modifications to the original library are commented like this */

/*
Railroad Diagrams
by Tab Atkins Jr. (and others)
http://xanthir.com
http://twitter.com/tabatkins
http://github.com/tabatkins/railroad-diagrams

This document and all associated files in the github project are licensed under CC0: http://creativecommons.org/publicdomain/zero/1.0/
This means you can reuse, remix, or otherwise appropriate this project for your own use WITHOUT RESTRICTION.
(The actual legal meaning can be found at the above link.)
Don't ask me for permission to use any part of this project, JUST USE IT.
I would appreciate attribution, but that is not required by the license.
*/

/*
This file uses a module pattern to avoid leaking names into the global scope.
The only accidental leakage is the name "temp".
The exported names can be found at the bottom of this file;
simply change the names in the array of strings to change what they are called in your application.

As well, several configuration constants are passed into the module function at the bottom of this file.
At runtime, these constants can be found on the Diagram class.
*/

var temp = (function(options) {
	function subclassOf(baseClass, superClass) {
		baseClass.prototype = Object.create(superClass.prototype);
		baseClass.prototype.$super = superClass.prototype;
	}

	function unnull(/* children */) {
		return [].slice.call(arguments).reduce(function(sofar, x) { return sofar !== undefined ? sofar : x; });
	}

	function determineGaps(outer, inner) {
		var diff = outer - inner;
		switch(Diagram.INTERNAL_ALIGNMENT) {
			case 'left': return [0, diff]; break;
			case 'right': return [diff, 0]; break;
			case 'center':
			default: return [diff/2, diff/2]; break;
		}
	}

	function wrapString(value) {
		return ((typeof value) == 'string') ? new Terminal(value) : value;
	}


	function SVG(name, attrs, text) {
		attrs = attrs || {};
		text = text || '';
		var el = document.createElementNS("http://www.w3.org/2000/svg",name);
		for(var attr in attrs) {
			el.setAttribute(attr, attrs[attr]);
		}
		el.textContent = text;
		return el;
	}

	function FakeSVG(tagName, attrs, text){
		if(!(this instanceof FakeSVG)) return new FakeSVG(tagName, attrs, text);
		if(text) this.children = text;
		else this.children = [];
		this.tagName = tagName;
		this.attrs = unnull(attrs, {});
		return this;
	};
	FakeSVG.prototype.format = function(x, y, width) {
		// Virtual
	};
	FakeSVG.prototype.addTo = function(parent) {
		if(parent instanceof FakeSVG) {
			parent.children.push(this);
			return this;
		} else {
			var svg = this.toSVG();
			parent.appendChild(svg);
			return svg;
		}
	};
	FakeSVG.prototype.toSVG = function() {
		var el = SVG(this.tagName, this.attrs);
		if(typeof this.children == 'string') {
			el.textContent = this.children;
		} else {
			this.children.forEach(function(e) {
				el.appendChild(e.toSVG());
			});
		}
		return el;
	};
	FakeSVG.prototype.toString = function() {
		var str = '<' + this.tagName;
		var group = this.tagName == "g" || this.tagName == "svg";
		for(var attr in this.attrs) {
			str += ' ' + attr + '="' + (this.attrs[attr]+'').replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"';
		}
		str += '>';
		if(group) str += "\n";
		if(typeof this.children == 'string') {
			str += this.children.replace(/&/g, '&amp;').replace(/</g, '&lt;');
		} else {
			this.children.forEach(function(e) {
				str += e;
			});
		}
		str += '</' + this.tagName + '>\n';
		return str;
	}

	function Path(x,y,attrs) {
		if(!(this instanceof Path)) return new Path(x,y,attrs);
		FakeSVG.call(this, 'path', attrs);
		this.attrs.d = "M"+x+' '+y;
	}
	subclassOf(Path, FakeSVG);
	Path.prototype.m = function(x,y) {
		this.attrs.d += 'm'+x+' '+y;
		return this;
	}
	Path.prototype.h = function(val) {
		this.attrs.d += 'h'+val;
		return this;
	}
	Path.prototype.right = Path.prototype.h;
	Path.prototype.left = function(val) { return this.h(-val); }
	Path.prototype.v = function(val) {
		this.attrs.d += 'v'+val;
		return this;
	}
	Path.prototype.down = Path.prototype.v;
	Path.prototype.up = function(val) { return this.v(-val); }
	Path.prototype.arc = function(sweep){
		var x = Diagram.ARC_RADIUS;
		var y = Diagram.ARC_RADIUS;
		if(sweep[0] == 'e' || sweep[1] == 'w') {
			x *= -1;
		}
		if(sweep[0] == 's' || sweep[1] == 'n') {
			y *= -1;
		}
		if(sweep == 'ne' || sweep == 'es' || sweep == 'sw' || sweep == 'wn') {
			var cw = 1;
		} else {
			var cw = 0;
		}
		this.attrs.d += "a"+Diagram.ARC_RADIUS+" "+Diagram.ARC_RADIUS+" 0 0 "+cw+' '+x+' '+y;
		return this;
	}
	Path.prototype.format = function() {
		// All paths in this library start/end horizontally.
		// The extra .5 ensures a minor overlap, so there's no seams in bad rasterizers.
		this.attrs.d += 'h.5';
		return this;
	}
/* TiddlyWiki: added support for arbitrary straight lines */
	Path.prototype.line = function(dx,dy) {
		this.attrs.d += "l"+dx+" "+dy;
		return this;
	}

/* TiddlyWiki: added twOptions parameter, passing it to Start() and End() */
	function Diagram(twOptions, items) {
		if(!(this instanceof Diagram)) return new Diagram(twOptions, [].slice.call(arguments,1));
		FakeSVG.call(this, 'svg', {class: Diagram.DIAGRAM_CLASS});
		this.items = items.map(wrapString);
		this.items.unshift(new Start(twOptions.start));
		this.items.push(new End(twOptions.end));
		// this.width = this.items.reduce(function(sofar, el) { return sofar + el.width + (el.needsSpace?20:0)}, 0)+1;
		// this.up = Math.max.apply(null, this.items.map(function (x) { return x.up; }));
		// this.down = Math.max.apply(null, this.items.map(function (x) { return x.down; }));

		this.up = this.down = this.height = this.width = 0;
		for(const item of this.items) {
			if (!item.height)
				item.height = 0;
			this.width += item.width + (item.needsSpace?20:0);
			this.up = Math.max(this.up, item.up - this.height);
			this.height += item.height;
			this.down = Math.max(this.down - item.height, item.down);
		}		

		this.formatted = false;		
	}
	subclassOf(Diagram, FakeSVG);
	for(var option in options) {
		Diagram[option] = options[option];
	}
	Diagram.prototype.format = function(paddingt, paddingr, paddingb, paddingl) {
		paddingt = unnull(paddingt, 20);
		paddingr = unnull(paddingr, paddingt, 20);
		paddingb = unnull(paddingb, paddingt, 20);
		paddingl = unnull(paddingl, paddingr, 20);
		var x = paddingl;
		var y = paddingt;
		y += this.up;
		var g = FakeSVG('g', Diagram.STROKE_ODD_PIXEL_LENGTH ? {transform:'translate(.5 .5)'} : {});
		for(var i = 0; i < this.items.length; i++) {
			var item = this.items[i];
			if(item.needsSpace) {
				Path(x,y).h(10).addTo(g);
				x += 10;
			}
			item.format(x, y, item.width).addTo(g);
			x += item.width;
			if (!item.height)
				item.height = 0;
			y += item.height;
			if(item.needsSpace) {
				Path(x,y).h(10).addTo(g);
				x += 10;
			}
		}
		this.attrs.width = this.width + paddingl + paddingr;
		this.attrs.height = this.up + this.height + this.down + paddingt + paddingb;
		this.attrs.viewBox = "0 0 "  + this.attrs.width + " " + this.attrs.height;
		g.addTo(this);
		this.formatted = true;
		return this;
	}
	Diagram.prototype.addTo = function(parent) {
		var scriptTag = document.getElementsByTagName('script');
		scriptTag = scriptTag[scriptTag.length - 1];
		var parentTag = scriptTag.parentNode;
		parent = parent || parentTag;
		return this.$super.addTo.call(this, parent);
	}
	Diagram.prototype.toSVG = function() {
		if (!this.formatted) {
			this.format();
		}
		return this.$super.toSVG.call(this);
	}
	Diagram.prototype.toString = function() {
		if (!this.formatted) {
			this.format();
		}
		return this.$super.toString.call(this);
	}

	function Sequence(items) {
		if(!(this instanceof Sequence)) return new Sequence([].slice.call(arguments));
		FakeSVG.call(this, 'g');
		this.items = items.map(wrapString);
		this.width = this.items.reduce(function(sofar, el) { return sofar + el.width + (el.needsSpace?20:0)}, 0);
		this.up = this.items.reduce(function(sofar,el) { return Math.max(sofar, el.up)}, 0);
		this.down = this.items.reduce(function(sofar,el) { return Math.max(sofar, el.down)}, 0);
	}
	subclassOf(Sequence, FakeSVG);
	Sequence.prototype.format = function(x,y,width) {
		// Hook up the two sides if this is narrower than its stated width.
		var gaps = determineGaps(width, this.width);
		Path(x,y).h(gaps[0]).addTo(this);
		Path(x+gaps[0]+this.width,y).h(gaps[1]).addTo(this);
		x += gaps[0];

		for(var i = 0; i < this.items.length; i++) {
			var item = this.items[i];
			if(item.needsSpace) {
				Path(x,y).h(10).addTo(this);
				x += 10;
			}
			item.format(x, y, item.width).addTo(this);
			x += item.width;
			if(item.needsSpace) {
				Path(x,y).h(10).addTo(this);
				x += 10;
			}
		}
		return this;
	}

	function Stack(items) {
		if(!(this instanceof Stack)) return new Stack([].slice.call(arguments));
		FakeSVG.call(this, 'g');
		if( items.length === 0 ) {
			throw new RangeError("Stack() must have at least one child.");
		}
		this.items = items.map(wrapString);
		this.width = Math.max.apply(null, this.items.map(function(e) { return e.width + (e.needsSpace?20:0); }));
		//if(this.items[0].needsSpace) this.width -= 10;
		//if(this.items[this.items.length-1].needsSpace) this.width -= 10;
		if(this.items.length > 1){
			this.width += Diagram.ARC_RADIUS*2;
		}
		this.needsSpace = true;
		this.up = this.items[0].up;
		this.down = this.items[this.items.length-1].down;

		this.height = 0;
		var last = this.items.length - 1;
		for(var i = 0; i < this.items.length; i++) {
			var item = this.items[i];
			if (!item.height) 
				item.height = 0;  
			this.height += item.height;  
			if(i > 0) {
				this.height += Math.max(Diagram.ARC_RADIUS*2, item.up + Diagram.VERTICAL_SEPARATION);
			}
			if(i < last) {
				this.height += Math.max(Diagram.ARC_RADIUS*2, item.down + Diagram.VERTICAL_SEPARATION);
			}
		}
	}

	subclassOf(Stack, FakeSVG);
	Stack.prototype.format = function(x,y,width) {
		var gaps = determineGaps(width, this.width);
		Path(x,y).h(gaps[0]).addTo(this);
		x += gaps[0];
		var xInitial = x;
		if(this.items.length > 1) {
			Path(x, y).h(Diagram.ARC_RADIUS).addTo(this);
			x += Diagram.ARC_RADIUS;
		}

		for(var i = 0; i < this.items.length; i++) {
			var item = this.items[i];
			var innerWidth = this.width - (this.items.length>1 ? Diagram.ARC_RADIUS*2 : 0);
			item.format(x, y, innerWidth).addTo(this);
			x += innerWidth;
			y += item.height;

			if(i !== this.items.length-1) {
				Path(x, y)
					.arc('ne').down(Math.max(0, item.down + Diagram.VERTICAL_SEPARATION - Diagram.ARC_RADIUS*2))
					.arc('es').left(innerWidth)
					.arc('nw').down(Math.max(0, this.items[i+1].up + Diagram.VERTICAL_SEPARATION - Diagram.ARC_RADIUS*2))
					.arc('ws').addTo(this);
				y += Math.max(item.down + Diagram.VERTICAL_SEPARATION, Diagram.ARC_RADIUS*2) + Math.max(this.items[i+1].up + Diagram.VERTICAL_SEPARATION, Diagram.ARC_RADIUS*2);
				//y += Math.max(Diagram.ARC_RADIUS*4, item.down + Diagram.VERTICAL_SEPARATION*2 + this.items[i+1].up)
				x = xInitial+Diagram.ARC_RADIUS;
			}

		}

		if(this.items.length > 1) {
			Path(x,y).h(Diagram.ARC_RADIUS).addTo(this);
			x += Diagram.ARC_RADIUS;
		}
		Path(x,y).h(gaps[1]).addTo(this);

		return this;
	}


	function Choice(normal, items) {
		if(!(this instanceof Choice)) return new Choice(normal, [].slice.call(arguments,1));
		FakeSVG.call(this, 'g');
		if( typeof normal !== "number" || normal !== Math.floor(normal) ) {
			throw new TypeError("The first argument of Choice() must be an integer.");
		} else if(normal < 0 || normal >= items.length) {
			throw new RangeError("The first argument of Choice() must be an index for one of the items.");
		} else {
			this.normal = normal;
		}
		this.items = items.map(wrapString);
		this.width = this.items.reduce(function(sofar, el){return Math.max(sofar, el.width)},0) + Diagram.ARC_RADIUS*4;
		this.up = this.down = 0;
		for(var i = 0; i < this.items.length; i++) {
			var item = this.items[i];
			if(i < normal) { this.up += Math.max(Diagram.ARC_RADIUS,item.up + item.down + Diagram.VERTICAL_SEPARATION); }
			if(i == normal) { this.up += Math.max(Diagram.ARC_RADIUS, item.up); this.down += Math.max(Diagram.ARC_RADIUS, item.down); }
			if(i > normal) { this.down += Math.max(Diagram.ARC_RADIUS,Diagram.VERTICAL_SEPARATION + item.up + item.down); }
		}
	}
	subclassOf(Choice, FakeSVG);
	Choice.prototype.format = function(x,y,width) {
		// Hook up the two sides if this is narrower than its stated width.
		var gaps = determineGaps(width, this.width);
		Path(x,y).h(gaps[0]).addTo(this);
		Path(x+gaps[0]+this.width,y).h(gaps[1]).addTo(this);
		x += gaps[0];

		var last = this.items.length -1;
		var innerWidth = this.width - Diagram.ARC_RADIUS*4;

		// Do the elements that curve above
		for(var i = this.normal - 1; i >= 0; i--) {
			var item = this.items[i];
			if( i == this.normal - 1 ) {
				var distanceFromY = Math.max(Diagram.ARC_RADIUS*2, this.items[i+1].up + Diagram.VERTICAL_SEPARATION + item.down);
			}
			Path(x,y).arc('se').up(distanceFromY - Diagram.ARC_RADIUS*2).arc('wn').addTo(this);
			item.format(x+Diagram.ARC_RADIUS*2,y - distanceFromY,innerWidth).addTo(this);
			Path(x+Diagram.ARC_RADIUS*2+innerWidth, y-distanceFromY).arc('ne').down(distanceFromY - Diagram.ARC_RADIUS*2).arc('ws').addTo(this);
			distanceFromY += Math.max(Diagram.ARC_RADIUS, item.up + Diagram.VERTICAL_SEPARATION + (i == 0 ? 0 : this.items[i-1].down));
		}

		// Do the straight-line path.
		Path(x,y).right(Diagram.ARC_RADIUS*2).addTo(this);
		this.items[this.normal].format(x+Diagram.ARC_RADIUS*2, y, innerWidth).addTo(this);
		Path(x+Diagram.ARC_RADIUS*2+innerWidth, y).right(Diagram.ARC_RADIUS*2).addTo(this);

		// Do the elements that curve below
		for(var i = this.normal+1; i <= last; i++) {
			var item = this.items[i];
			if( i == this.normal + 1 ) {
				var distanceFromY = Math.max(Diagram.ARC_RADIUS*2, this.items[i-1].down + Diagram.VERTICAL_SEPARATION + item.up);
			}
			Path(x,y).arc('ne').down(distanceFromY - Diagram.ARC_RADIUS*2).arc('ws').addTo(this);
			item.format(x+Diagram.ARC_RADIUS*2, y+distanceFromY, innerWidth).addTo(this);
			Path(x+Diagram.ARC_RADIUS*2+innerWidth, y+distanceFromY).arc('se').up(distanceFromY - Diagram.ARC_RADIUS*2).arc('wn').addTo(this);
			distanceFromY += Math.max(Diagram.ARC_RADIUS, item.down + Diagram.VERTICAL_SEPARATION + (i == last ? 0 : this.items[i+1].up));
		}

		return this;
	}

	function Optional(item, skip) {
		if( skip === undefined )
			return Choice(1, Skip(), item);
		else if ( skip === "skip" )
			return Choice(0, Skip(), item);
		else
			throw "Unknown value for Optional()'s 'skip' argument.";
	}

/* TiddlyWiki: added wantArrow */
	function OneOrMore(item, rep, wantArrow) {
		if(!(this instanceof OneOrMore)) return new OneOrMore(item, rep, wantArrow);
		FakeSVG.call(this, 'g');

/* TiddlyWiki: code added */
		this.wantArrow = wantArrow;

		rep = rep || (new Skip);
		this.item = wrapString(item);
		this.rep = wrapString(rep);
		this.width = Math.max(this.item.width, this.rep.width) + Diagram.ARC_RADIUS*2;
		this.up = this.item.up;
		this.down = Math.max(Diagram.ARC_RADIUS*2, this.item.down + Diagram.VERTICAL_SEPARATION + this.rep.up + this.rep.down);

/* TiddlyWiki: moved calculation of distanceFromY (of the repeat arc) to here */
		this.distanceFromY = Math.max(Diagram.ARC_RADIUS*2, this.item.down+Diagram.VERTICAL_SEPARATION+this.rep.up);
	}
	subclassOf(OneOrMore, FakeSVG);
	OneOrMore.prototype.needsSpace = true;
	OneOrMore.prototype.format = function(x,y,width) {
		// Hook up the two sides if this is narrower than its stated width.
		var gaps = determineGaps(width, this.width);
		Path(x,y).h(gaps[0]).addTo(this);
		Path(x+gaps[0]+this.width,y).h(gaps[1]).addTo(this);
		x += gaps[0];

		// Draw item
		Path(x,y).right(Diagram.ARC_RADIUS).addTo(this);
		this.item.format(x+Diagram.ARC_RADIUS,y,this.width-Diagram.ARC_RADIUS*2).addTo(this);
		Path(x+this.width-Diagram.ARC_RADIUS,y).right(Diagram.ARC_RADIUS).addTo(this);

		// Draw repeat arc
/* TiddlyWiki: moved calculation of distanceFromY from here to constructor */
		var distanceFromY = this.distanceFromY;
		
		Path(x+Diagram.ARC_RADIUS,y).arc('nw').down(distanceFromY-Diagram.ARC_RADIUS*2).arc('ws').addTo(this);
		this.rep.format(x+Diagram.ARC_RADIUS, y+distanceFromY, this.width - Diagram.ARC_RADIUS*2).addTo(this);
		Path(x+this.width-Diagram.ARC_RADIUS, y+distanceFromY).arc('se').up(distanceFromY-Diagram.ARC_RADIUS*2).arc('en').addTo(this);
		
/* TiddlyWiki: code added */
		if(this.wantArrow) {
			var arrowSize = Diagram.ARC_RADIUS/2;
			// Compensate for the illusion that makes the arrow look unbalanced if it's too close to the curve below it
			var multiplier = (distanceFromY < arrowSize*5) ? 1.2 : 1;
			Path(x-arrowSize, y+distanceFromY/2 + arrowSize/2, {class:"arrow"}).
				line(arrowSize, -arrowSize).line(arrowSize*multiplier, arrowSize).addTo(this);
		}

		return this;
	}

	function ZeroOrMore(item, rep, skip, wantArrow) {
		return Optional(OneOrMore(item, rep, wantArrow), skip);
	}

/* TiddlyWiki: added type parameter */
	function Start(type) {
		if(!(this instanceof Start)) return new Start(type);
		FakeSVG.call(this, 'path');
		this.type = type || 'single'
		this.width = (this.type === 'double') ? 20 : 10;
		this.up = 10;
		this.down = 10;
	}
	subclassOf(Start, FakeSVG);
	Start.prototype.format = function(x,y) {
/* TiddlyWiki: added types */
		if(this.type === 'single') {
			this.attrs.d = 'M '+x+' '+(y-10)+' v 20 m 0 -10 h 10.5';
		} else if(this.type === 'double') {
			this.attrs.d = 'M '+x+' '+(y-10)+' v 20 m 10 -20 v 20 m -10 -10 h 20.5';
		} else { // 'none'
			this.attrs.d = 'M '+x+' '+y+' h 10.5';
		}
		return this;
	}

/* TiddlyWiki: added type parameter */
	function End(type) {
		if(!(this instanceof End)) return new End(type);
		FakeSVG.call(this, 'path');
		this.type = type || 'double';
		this.width = (this.type === 'double') ? 20 : 10;
		this.up = 10;
		this.down = 10;
	}
	subclassOf(End, FakeSVG);
	End.prototype.format = function(x,y) {
/* TiddlyWiki: added types */
		if(this.type === 'single') {
			this.attrs.d = 'M '+x+' '+y+' h 10 m 0 -10 v 20';
		} else if(this.type === 'double') {
			this.attrs.d = 'M '+x+' '+y+' h 20 m -10 -10 v 20 m 10 -20 v 20';
		} else { // 'none'
			this.attrs.d = 'M '+x+' '+y+' h 10';
		}
		return this;
	}

	function Terminal(text) {
		if(!(this instanceof Terminal)) return new Terminal(text);
		FakeSVG.call(this, 'g');
		this.text = text;
		this.width = text.length * 8 + 20; /* Assume that each char is .5em, and that the em is 16px */
		this.up = 11;
		this.down = 11;
	}
	subclassOf(Terminal, FakeSVG);
	Terminal.prototype.needsSpace = true;
	Terminal.prototype.format = function(x, y, width) {
		// Hook up the two sides if this is narrower than its stated width.
		var gaps = determineGaps(width, this.width);
		Path(x,y).h(gaps[0]).addTo(this);
		Path(x+gaps[0]+this.width,y).h(gaps[1]).addTo(this);
		x += gaps[0];

		FakeSVG('rect', {x:x, y:y-11, width:this.width, height:this.up+this.down, rx:10, ry:10}).addTo(this);
		FakeSVG('text', {x:x+this.width/2, y:y+4}, this.text).addTo(this);
		return this;
	}

	function NonTerminal(text) {
		if(!(this instanceof NonTerminal)) return new NonTerminal(text);
		FakeSVG.call(this, 'g');
		this.text = text;
		this.width = text.length * 8 + 20;
		this.up = 11;
		this.down = 11;
	}
	subclassOf(NonTerminal, FakeSVG);
	NonTerminal.prototype.needsSpace = true;
	NonTerminal.prototype.format = function(x, y, width) {
		// Hook up the two sides if this is narrower than its stated width.
		var gaps = determineGaps(width, this.width);
		Path(x,y).h(gaps[0]).addTo(this);
		Path(x+gaps[0]+this.width,y).h(gaps[1]).addTo(this);
		x += gaps[0];

		FakeSVG('rect', {x:x, y:y-11, width:this.width, height:this.up+this.down}).addTo(this);
		FakeSVG('text', {x:x+this.width/2, y:y+4}, this.text).addTo(this);
		return this;
	}

	function Comment(text) {
		if(!(this instanceof Comment)) return new Comment(text);
		FakeSVG.call(this, 'g');
		this.text = text;
		this.width = text.length * 7 + 10;
		this.up = 11;
		this.down = 11;
	}
	subclassOf(Comment, FakeSVG);
	Comment.prototype.needsSpace = true;
	Comment.prototype.format = function(x, y, width) {
		// Hook up the two sides if this is narrower than its stated width.
		var gaps = determineGaps(width, this.width);
		Path(x,y).h(gaps[0]).addTo(this);
		Path(x+gaps[0]+this.width,y).h(gaps[1]).addTo(this);
		x += gaps[0];

		FakeSVG('text', {x:x+this.width/2, y:y+5, class:'comment'}, this.text).addTo(this);
		return this;
	}

	function Skip() {
		if(!(this instanceof Skip)) return new Skip();
		FakeSVG.call(this, 'g');
		this.width = 0;
		this.up = 0;
		this.down = 0;
	}
	subclassOf(Skip, FakeSVG);
	Skip.prototype.format = function(x, y, width) {
		Path(x,y).right(width).addTo(this);
		return this;
	}
	
/* TiddlyWiki: added linking ability */
	function Link(item,options) {
		if(!(this instanceof Link)) return new Link(item,options);
		FakeSVG.call(this,'a',options);
		this.item = item;
		this.width = item.width;
		this.up = item.up;
		this.down = item.down;
	}
	subclassOf(Link, FakeSVG);
	Link.prototype.needsSpace = true;
	Link.prototype.format = function(x, y, width) {
		this.item.format(x,y,width).addTo(this);
		return this;
	}

/* TiddlyWiki: this block replaces the export mechanism in the original library */
	if (exports) {
		exports.Diagram = Diagram;
		exports.Sequence = Sequence;
		exports.Stack = Stack;
		exports.Choice = Choice;
		exports.Optional = Optional;
		exports.OneOrMore = OneOrMore;
		exports.ZeroOrMore = ZeroOrMore;
		exports.Terminal = Terminal;
		exports.NonTerminal = NonTerminal;
		exports.Comment = Comment;
		exports.Skip = Skip;
		exports.Link = Link;
	};
})(
	{
	VERTICAL_SEPARATION: 8,
	ARC_RADIUS: 10,
	DIAGRAM_CLASS: 'railroad-diagram',
	STROKE_ODD_PIXEL_LENGTH: true,
	INTERNAL_ALIGNMENT: 'center',
	}
);

/* TiddlyWiki: removed assignments to properties of the window object */
