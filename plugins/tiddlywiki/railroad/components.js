/*\
title: $:/plugins/tiddlywiki/railroad/components.js
type: application/javascript
module-type: library

Components of a railroad diagram.

\*/
(function(){

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";
	
	var railroad = require("$:/plugins/tiddlywiki/railroad/railroad-diagrams.js");
	
	/////////////////////////// Base component
	
	var Component = function() {
		this.type = "Component";
	};
	
	// Set up a leaf component
	Component.prototype.initialiseLeaf = function(type,text) {
		this.type = type;
		this.text = text;
	};
	
	// Set up a component with a single child
	Component.prototype.initialiseWithChild = function(type,content) {
		this.type = type;
		this.child = toSingleChild(content);
	};
	
	// Set up a component with an array of children
	Component.prototype.initialiseWithChildren = function(type,content) {
		this.type = type;
		// Force the content to be an array
		this.children = $tw.utils.isArray(content) ? content : [content];
	}
	
	// Return an array of the SVG strings of an array of children
	Component.prototype.getSvgOfChildren = function() {
		return this.children.map(function(child) {
			return child.toSvg();
		});
	}
	
	Component.prototype.toSvg = function() {
		return "";
	}
	
	Component.prototype.debug = function(output,indent) {
		output.push(indent);
		output.push(this.type);
		// Add the text of a leaf component
		if(this.text && this.text !== "") {
			output.push(": ");
			output.push(this.text);
		}
		// Flag the normal route
		if(this.normal !== undefined) {
			if(this.normal === true) {
				output.push(" (normal)");
			} else if(this.normal !== false) {
				output.push(" (normal: ");
				output.push(this.normal);
				output.push(")");
			}
		}
		output.push("\n");
		var contentIndent = indent + "  ";
		// Add the one child
		if(this.child) {
			this.child.debug(output,contentIndent);
		}
		// Add the array of children
		if(this.children) {
			this.debugArray(this.children,output,contentIndent);
		}
			// Add the separator if there is one
		if(this.separator) {
			output.push(indent);
			output.push("(separator)\n");
			this.separator.debug(output,contentIndent);
		}
	};
	
	Component.prototype.debugArray = function(array,output,indent) {
		for(var i=0; i<array.length; i++) {
			var item = array[i];
			// Choice content is a special case: we number the branches
			if(item.isChoiceBranch) {
				output.push(indent);
				output.push("(");
				output.push(i);
				output.push(")\n");
				item.debug(output,"  "+indent);
			} else {
				item.debug(output,indent);
			}
		}
	}
	
	var toSingleChild = function(content) {
		if($tw.utils.isArray(content)) {
			// Reduce an array of one child to just the child
			if(content.length === 1) {
				return content[0];
			} else {
				// Never allow an empty sequence
					if(content.length === 0) {
						content.push(new Dummy());
					}
				// Wrap multiple children into a single sequence component
				return new Sequence(content);
			}
		} else {
			// Already single
			return content;
		}
	}
	
	/////////////////////////// Leaf components
	
	var Comment = function(text, {href, title}={}) {
		this.initialiseLeaf("Comment",text);
		this.config = {href: href, title: title};
	};
	
	Comment.prototype = new Component();
	
	Comment.prototype.toSvg = function() {
		return railroad.Comment(this.text, this.config);
	}
	
	var Dummy = function() {
		this.initialiseLeaf("Dummy");
	};
	
	Dummy.prototype = new Component();
	
	Dummy.prototype.toSvg = function() {
		return railroad.Skip();
	}

	var End = function(endType, eol) {
		this.initialiseLeaf("End");
		this.endType = endType;
		this.makeEol = eol;
	};
	
	End.prototype = new Component();
	
	End.prototype.toSvg = function() {
		return railroad.End({type: this.endType, eol: this.makeEol} );
	}
	
	var Nonterminal = function(text, {href, title}={}) {
		this.initialiseLeaf("Nonterminal",text);
		this.config = {href: href, title: title};
	};
	
	Nonterminal.prototype = new Component();
	
	Nonterminal.prototype.toSvg = function() {
		return railroad.NonTerminal(this.text, this.config);
	}
	
	var Terminal = function(text, {href, title}={}) {
		this.initialiseLeaf("Terminal",text);
		this.config = {href: href, title: title};
	};
	
	Terminal.prototype = new Component();
	
	Terminal.prototype.toSvg = function() {
		return railroad.Terminal(this.text, this.config);
	}
	
	/////////////////////////// Components with one child
	
	var Optional = function(content,normal) {
		this.initialiseWithChild("Optional",content);
		this.normal = normal;
	};
	
	Optional.prototype = new Component();
	
	Optional.prototype.toSvg = function() {
		// Call Optional(component,"skip")
		return railroad.Optional(this.child.toSvg(), this.normal ? undefined : "skip");
	}
	
	var OptionalRepeated = function(content,separator,normal) {
		this.initialiseWithChild("OptionalRepeated",content);
		this.separator = toSingleChild(separator);
		this.normal = normal;
	};
	
	OptionalRepeated.prototype = new Component();
	
	OptionalRepeated.prototype.toSvg = function() {
		// Call ZeroOrMore(component,separator,"skip")
		var separatorSvg = this.separator ? this.separator.toSvg() : null;
		var skip = this.normal ? undefined : "skip";
		return railroad.ZeroOrMore(this.child.toSvg(),separatorSvg,skip);
	}
	
	var Repeated = function(content,separator,showArrows) {
		this.initialiseWithChild("Repeated",content);
		this.separator = toSingleChild(separator);
		this.showArrows = showArrows;
	};
	
	Repeated.prototype = new Component();
	
	Repeated.prototype.toSvg = function() {
		// Call OneOrMore(component,separator)
		var separatorSvg = this.separator ? this.separator.toSvg() : null;
		return railroad.OneOrMore(this.child.toSvg(),separatorSvg,this.showArrows);
	}
	
	var Link = function(content,twOptions) {
		this.initialiseWithChild("Link",content);
		this.twOptions = twOptions;
	};
	
	Link.prototype = new Component();
	
	Link.prototype.toSvg = function() {
		return railroad.Link(this.child.toSvg(),this.twOptions);
	}
	
	var Transclusion = function(content) {
		this.initialiseWithChild("Transclusion",content);
	};
	
	Transclusion.prototype = new Component();
	
	Transclusion.prototype.toSvg = function() {
		return this.child.toSvg();
	}
	
	/////////////////////////// Components with an array of children
	
	var Root = function(content) {
		this.initialiseWithChildren("Root",content);
	};
	
	Root.prototype = new Component();
	
	Root.prototype.toSvg = function() {
		var args = this.getSvgOfChildren();
		return railroad.Diagram.apply(null,args);
	}

	var Script = function(content) {
		this.initialiseLeaf("Script", content);
	};
	Script.prototype = new Component();
	Script.prototype.toSvg = function() {
		return railroad.generate(this.text);
	};
	
	var Sequence = function(content) {
		this.initialiseWithChildren("Sequence",content);
	};
	
	Sequence.prototype = new Component();
	
	Sequence.prototype.toSvg = function() {
		// Call Sequence(component1,component2,...)
		return railroad.Sequence.apply(null,this.getSvgOfChildren());
	}
	
	var Stack = function(content) {
		this.initialiseWithChildren("Stack",content);
	};
	
	Stack.prototype = new Component();
	
	Stack.prototype.toSvg = function() {
		// Call Stack(component1,component2,...)
		return railroad.Stack.apply(null,this.getSvgOfChildren());
	}
	
	///

	var Choice = function(normal, content) {
		this.initialiseWithChildren("Choice",content.map(toSingleChild));
		for(var i=0; i<this.children.length; i++) {
			this.children[i].isChoiceBranch = true;
		}
		this.normal = normal;
	};
	
	Choice.prototype = new Component();
	
	Choice.prototype.toSvg = function() {
		// Call Choice(normal,component1,component2,...)
		var args = this.getSvgOfChildren();
		args.unshift(this.normal);
		return railroad.Choice.apply(null,args);
	}
	
	var OptionalSequence = function(content) {
		this.initialiseWithChildren("OptionalSequence",content.map(toSingleChild));
		for(var i=0; i<this.children.length; i++) {
			this.children[i].isChoiceBranch = true;
		}
	};
	
	OptionalSequence.prototype = new Component();
	
	OptionalSequence.prototype.toSvg = function() {
		// Call OptionalSequence(component1,component2,...)
		var args = this.getSvgOfChildren();
		return railroad.OptionalSequence.apply(null,args);
	}

	var AlternatingSequence = function(content) {
		this.initialiseWithChildren("AlternatingSequence",content.map(toSingleChild));
		for(var i=0; i<this.children.length; i++) {
			this.children[i].isChoiceBranch = true;
		}
	};
	
	AlternatingSequence.prototype = new Component();
	
	AlternatingSequence.prototype.toSvg = function() {
		// Call AlternatingSequence(component1,component2,...)
		var args = this.getSvgOfChildren();
		return railroad.AlternatingSequence.apply(null,args);
	}

	var HorizontalChoice = function(content) {
		this.initialiseWithChildren("HorizontalChoice",content.map(toSingleChild));
		for(var i=0; i<this.children.length; i++) {
			this.children[i].isChoiceBranch = true;
		}
	};
	
	HorizontalChoice.prototype = new Component();
	
	HorizontalChoice.prototype.toSvg = function() {
		// Call HorizontalChoice(component1,component2,...)
		var args = this.getSvgOfChildren();
		return railroad.HorizontalChoice.apply(null,args);
	}

	var MultipleChoice = function(content, normal, type) {
		this.initialiseWithChildren("MultipleChoice",content.map(toSingleChild));
		for(var i=0; i<this.children.length; i++) {
			this.children[i].isChoiceBranch = true;
		}
		this.normal = normal;
		this.type = type;
	};
	
	MultipleChoice.prototype = new Component();
	
	MultipleChoice.prototype.toSvg = function() {
		// Call MultipleChoice(normal,component1,component2,...)
		var args = this.getSvgOfChildren();
		args.unshift(this.normal, this.type);
		return railroad.MultipleChoice.apply(null,args);
	}
	
	/////////////////////////// Exports
	
	exports.components = {
		Choice: Choice,
		OptionalSequence: OptionalSequence,
		AlternatingSequence: AlternatingSequence,
		HorizontalChoice: HorizontalChoice,
		MultipleChoice: MultipleChoice,
		Comment: Comment,
		Dummy: Dummy,
		End: End,
		Link: Link,
		Nonterminal: Nonterminal,
		Optional: Optional,
		OptionalRepeated: OptionalRepeated,
		Repeated: Repeated,
		Root: Root,
		Sequence: Sequence,
		Stack: Stack,
		Terminal: Terminal,
		Transclusion: Transclusion,
		Script: Script,
		railroad: railroad
	};
	
	})();