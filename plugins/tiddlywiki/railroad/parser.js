/*\
title: $:/plugins/tiddlywiki/railroad/parser.js
type: application/javascript
module-type: library

Parser for the source of a railroad diagram.

[:x]			optional, normally included
[x]				optional, normally omitted
{x}				one or more
{x y}		one or more
[{:x y}]			zero or more, normally included
[{:x + y}]		zero or more with lower captioning, normally included
[{x y}]			zero or more, normally omitted
[{x + y}]		zero or more, normally omitted
x y z			sequence
<-x y z ->		explicit sequence
<^x y z^>		explicit stack sequence (ie. Stack)
<!x y!>   alternating sequence (ie. AlternatingSequence)
<?x y z?>   optional sequence (ie. OptionalSequence)
(x|y|z)			alternatives (ie, Choice)
(x|:y|z)		alternatives, normally y (ie, Choice)
(-x|y|z-)		horizontal alternatives (ie. HorizontalChoice)
($x|:y|z$)	all alternatives, normally y (ie. MultipleChoice)
(&x|:y|z&)	any alternatives, normally y (ie. MultipleChoice)
"x|link"		terminal with optional link
<"x|link">	nonterminal with optional link
/"blah|link"/		comment (see titleLinkDelim for delimiter)
-						dummy
-||					end (simple: -||, complex: -|)
[[x|"tiddler"]]	link
{{"tiddler"}}	transclusion

"x" can also be written 'x' or """x"""

pragmas:
	\showArrows yes|no
	\closeEol yes|no
	\debug components
	\start simple|complex
	\startLabel string
	\end simple|complex
	\titleLinkDelim string

\*/
(function(){

	/*jslint node: true, browser: true */
	/*global $tw: false */
	"use strict";
	
	var components = require("$:/plugins/tiddlywiki/railroad/components.js").components;
	
	var Parser = function(widget,source,options) {
		components.railroad.Diagram.config = options;

		this.widget = widget;
		this.source = source;
		this.options = options;
		this.tokens = this.tokenise(source);
		this.tokenPos = 0;
		this.advance();
		this.content = this.parseContent();
		if (!this.root)
			this.root = new components.Root(this.content);
		this.checkFinished();
	};
	
	/////////////////////////// Parser dispatch
	
	Parser.prototype.parseContent = function() {
		var content = [];
		// Parse zero or more components
		while(true) {
			var component = this.parseComponent();
			if(!component) {
				break;
			}
			if(!component.isPragma) {
				content.push(component);
			}
		}
		return content;
	};
	
	Parser.prototype.parseComponent = function() {
		var component = null;
		if(this.token) {
			if(this.at("string")) {
				component = this.parseTerminal();
			} else if(this.at("name")) {
				component = this.parseName();
			} else if(this.at("pragma")) {
				component = this.parsePragma();
			} else if (this.at("script")) {
				component = this.parseScript();
			} else if (this.at("tw-ref")) {
				if (this.token.kind === "[[")
					component = this.parseLink();
				else
					component = this.parseTransclusion();
			} else {
				switch(this.token.value) {
					case "[":
						component = this.parseOptional();
						break;
					case "{":
						component = this.parseRepeated();
						break;
					case "<":
						component = this.parseNonterminal();
						break;
					case "(":
						component = this.parseChoice();
						break;
					case "(-":
						component = this.parseHorizontalChoice();
						break;
					case "($":
						component = this.parseMultipleChoice('$');
						break;
					case "(&":
						component = this.parseMultipleChoice('&');
						break;
					case "/":
						component = this.parseComment();
						break;
					case "<-":
						component = this.parseSequence();
						break;
					case "<^":
						component = this.parseStack();
						break;
					case "<!":
						component = this.parseAlternatingSequence();
						break;
					case "<?":
						component = this.parseOptionalSequence();
						break;
					case "-|":
						component = this.parseEnd(this.token.value);
						break;
					case "-||":
						component = this.parseEnd(this.token.value);
						break;
					case "-":
						component = this.parseDummy();
						break;
				}
			}
		}
		return component;
	};
	
	/////////////////////////// Specific components
	
	Parser.prototype.prepareTwLinkAttr = function(target) {
		var attr = {"data-tw-target": target};
		if($tw.utils.isLinkExternal(target)) {
			attr["data-tw-external"] = true;
		}
		return attr;
	};

	Parser.prototype.parseChoice = function() {
		// Consume the (
		this.advance();
		var content = [],
			colon = -1;
		do {
			// Allow at most one branch to be prefixed with a colon
			if(colon === -1 && this.eat(":")) {
				colon = content.length;
			}
			// Parse the next branch
			content.push(this.parseContent());
		} while(this.eat("|"));
		// Consume the closing bracket
		this.close(")");
		// Create a component
		return new components.Choice(colon === -1 ? 0 : colon, content);
	};

	Parser.prototype.parseMultipleChoice = function(key) {
		// Consume the ($ or (&)
		this.advance();
		var content = [],
			colon = -1;
		do {
			// Allow at most one branch to be prefixed with a colon
			if(colon === -1 && this.eat(":")) {
				colon = content.length;
			}
			// Parse the next branch
			content.push(this.parseContent());
		} while(this.eat("|"));
		// Consume the closing bracket
		this.close(key+")");
		// Create a component
		return new components.MultipleChoice(content, colon === -1 ? 0 : colon, key === '$' ? "all": "any");
	};

	Parser.prototype.parseHorizontalChoice = function() {
		// Consume the (-
		this.advance();
		var content = [];
		do {
			// Parse the next branch
			content.push(this.parseContent());
		} while(this.eat("|"));
		// Consume the closing bracket
		this.close("-)");
		// Create a component
		return new components.HorizontalChoice(content);
	};

	Parser.prototype.parseDummy = function() {
		// Consume the -
		this.advance();
		// Create a component
		return new components.Dummy();
	};

	Parser.prototype.parseEnd = function(sKind) {
		// Consume the -| or -||
		this.advance();
		var typeVal = sKind.length === 2 ? "complex": "simple";
		// Create a component
		return new components.End(typeVal, this.options.closeEol);
	};

	Parser.prototype.parseLink = function() {
		// Create a component
		var content = this.token.value;
		this.advance();
		var cmpAttr = {};
		var pos = content.indexOf(this.options.titleLinkDelim);
		if (pos !== -1) {
			var target = content.substr(pos+this.options.titleLinkDelim.length);
			content = content.substr(0, pos);
			cmpAttr = {href: this.prepareTwLinkAttr(target)};
		} else
			cmpAttr = {href: this.prepareTwLinkAttr(content)};
		return new components.Nonterminal(content, cmpAttr); // changed underlying implementation to Terminal
	};
	
	Parser.prototype.parseTransclusion = function() {
		// Consume the {{...}}
		var textRef = this.token.value;		
		this.advance();
		// Retrieve the content of the text reference
		var source = this.widget.wiki.getTextReference(textRef,"",this.widget.getVariable("currentTiddler"));
		// Parse the content
		var content = new Parser(this.widget,source, this.options).content;
		// Create a component
		return new components.Transclusion(content);
	};

	Parser.prototype.parseName = function() {
		// Create a component
		var component = new components.Nonterminal(this.token.value);
		// Consume the name
		this.advance();
		return component;
	};
	
	Parser.prototype.parseTerminal = function() {
		// Consume the string literal
		var content = this.token.value;
		var cmpAttr = {};
		var pos = content.indexOf(this.options.titleLinkDelim);
		if (pos !== -1) {
			var target = content.substr(pos+this.options.titleLinkDelim.length);
			content = content.substr(0, pos);
			cmpAttr = {href: this.prepareTwLinkAttr(target)};
		}
		this.advance();
		return new components.Terminal(content, cmpAttr);
	};
	
	Parser.prototype.parseNonterminal = function() {
		// Consume the <
		this.advance();
		// The nonterminal's name should be in a string literal
		var content = this.expectString("after <");
		// Consume the closing bracket
		this.close(">");
		var cmpAttr = {};
		var pos = content.indexOf(this.options.titleLinkDelim);
		if (pos !== -1) {
			var target = content.substr(pos+this.options.titleLinkDelim.length);
			content = content.substr(0, pos);
			cmpAttr = {href: this.prepareTwLinkAttr(target)};
		}
		// Create a component
		return new components.Nonterminal(content, cmpAttr);
	};
	
	Parser.prototype.parseComment = function() {
		// Consume the /
		this.advance();
		// The comment's content should be in a string literal
		var content = this.expectString("after /");
		var cmpAttr = {};
		var pos = content.indexOf(this.options.titleLinkDelim);
		if (pos !== -1) {
			var target = content.substr(pos+this.options.titleLinkDelim.length);
			content = content.substr(0, pos);
			cmpAttr = {href: this.prepareTwLinkAttr(target)};
		}
		// Consume the closing /
		this.close("/");
		// Create a component
		return new components.Comment(content, cmpAttr);
	};

	Parser.prototype.parseOptional = function() {
		// Consume the [
		this.advance();
		// Consume the { if there is one
		var repeated = this.eat("{");
		// Note whether omission is the normal route
		var normal = this.eat(":");
		// Parse the content
		var content = this.parseContent(),
			separator = null;
		// Parse the separator if there is one
		if(repeated && this.eat("+")) {
			separator = this.parseContent();
		}
		// Consume the closing brackets
		if(repeated) {
			this.close("}");
		}
		this.close("]");
		// Create a component
		return repeated ? new components.OptionalRepeated(content,separator,normal)
			: new components.Optional(content,normal);
	};
	
	Parser.prototype.parseRepeated = function() {
		// Consume the {
		this.advance();
		// Parse the content
		var content = this.parseContent(),
			separator = null;
		// Parse the separator if there is one
		if(this.eat("+")) {
			separator = this.parseContent();
		}
		// Consume the closing bracket
		this.close("}");
		// Create a component
		return new components.Repeated(content,separator,this.options.showArrows);
	};
	
	Parser.prototype.parseSequence = function() {
		// Consume the <-
		this.advance();
		// Parse the content
		var content = this.parseContent();
		// Consume the closing ->
		this.close("->");
		// Create a component
		return new components.Sequence(content);
	};
	
	Parser.prototype.parseStack = function() {
		// Consume the <^
		this.advance();
		// Parse the content
		var content = this.parseContent();
		// Consume the closing 
		this.close("^>");
		// Create a component
		return new components.Stack(content);
	};

	Parser.prototype.parseAlternatingSequence = function() {
		// Consume the <!
		this.advance();
		// Parse the content
		var content = this.parseContent();
		// Consume the closing 
		this.close("!>");
		// Create a component
		return new components.AlternatingSequence(content);
	};

	Parser.prototype.parseOptionalSequence = function() {
		// Consume the <?
		this.advance();
		// Parse the content
		var content = this.parseContent();
		// Consume the closing 
		this.close("?>");
		// Create a component
		return new components.OptionalSequence(content);
	};
	
	Parser.prototype.parseScript = function() {
		this.root = new components.Script(this.token.value);
		this.advance();
		return this.root;
	};
	
	/////////////////////////// Pragmas
	
	Parser.prototype.parsePragma = function() {
		// Create a dummy component
		var component = { isPragma: true };
		// Consume the pragma
		var pragma = this.token.value;
		this.advance();
		// Apply the setting
		if(pragma === "showArrows") {
			this.options.showArrows = this.parseYesNo(pragma);		
		} else if(pragma === "closeEol") {
			this.options.closeEol = this.parseYesNo(pragma);;
		} else if(pragma === "debug") {
			this.options.debug = true;
			components.railroad.Diagram.DEBUG = true;
		} else if(pragma === "start") {
			this.options.start = this.parseTerminusStyle(pragma);		
		} else if(pragma === "startLabel") {
			this.options.startLabel = this.parseSettingValue(pragma);		
		} else if(pragma === "end") {
			this.options.end = this.parseTerminusStyle(pragma);		
		} else if(pragma === "titleLinkDelim") {
			this.options.titleLinkDelim = this.parseSettingValue(pragma);		
		} else {
			throw "Invalid pragma";
		}
		return component;
	};
	
	Parser.prototype.parseYesNo = function(pragma) {
		return this.parseSetting(["yes","no"],pragma) === "yes";
	}
	
	Parser.prototype.parseTerminusStyle = function(pragma) {
		return this.parseSetting(["simple","complex"],pragma);
	}
	
	Parser.prototype.parseSetting = function(options,pragma) {
		if(this.at("string") && options.indexOf(this.token.value) !== -1) {
			return this.tokenValueEaten();		
		}
		throw options.join(" or ") + " expected after \\" + pragma;
	}

	Parser.prototype.parseSettingValue = function(pragma) {
		return this.tokenValueEaten();		
	}

	/////////////////////////// Token manipulation
	
	Parser.prototype.advance = function() {
		if(this.tokenPos >= this.tokens.length) {
			this.token = null;
		}
		this.token = this.tokens[this.tokenPos++];
	};
	
	Parser.prototype.at = function(token) {
		return this.token && (this.token.type === token || this.token.type === "token" && this.token.value === token);
	};
	
	Parser.prototype.eat = function(token) {
		var at = this.at(token);
		if(at) {
			this.advance();
		}
		return at;
	};
	
	Parser.prototype.tokenValueEaten = function() {
		var output = this.token.value;
		this.advance();
		return output;
	};
	
	Parser.prototype.close = function(token) {
		if(!this.eat(token)) {
			throw "Closing " + token + " expected";
		}
	};
	
	Parser.prototype.checkFinished = function() {
		if(this.token) {
			throw "Syntax error at " + this.token.value;
		}
	};
	
	Parser.prototype.expect = function(token) {
		if(!this.eat(token)) {
			throw token + " expected";
		}
	};
	
	Parser.prototype.expectString = function(context,token) {
		if(!this.at("string")) {
			token = token || "String";
			throw token + " expected " + context;
		}
		return this.tokenValueEaten();
	};
	
	Parser.prototype.expectNameOrString = function(context) {
		if(this.at("name")) {
			return this.tokenValueEaten();
		}
		return this.expectString(context,"Name or string");
	};
	
	/////////////////////////// Tokenisation
	
	Parser.prototype.tokenise = function(source) {
		var tokens = [],
			pos = 0,
			c1st, c2nd, c3rd, s1stAnd2nd, s, token;
		while(pos < source.length) {
			// Initialise this iteration
			s = token = null;
			// Skip whitespace
			pos = $tw.utils.skipWhiteSpace(source,pos);
			// Avoid falling off the end of the string
			if (pos >= source.length) {
				break;
			}
			// Examine the next characters
			c1st = source.charAt(pos);
			c2nd = source.charAt(pos+1); 
			c3rd = source.charAt(pos+2);
			s1stAnd2nd = c1st + c2nd;
			if (c1st === "\"" || c1st === "'") { 
				// String literal
				token = $tw.utils.parseStringLiteral(source,pos);
				if(!token) {
					throw "Unterminated string literal";
				}
			} else if ("[]{}".indexOf(c1st) !== -1) {
				// Single or double character
				s = c2nd === c1st ? c1st + c1st : c1st;
				if (s.length === 2)
					token = this.readTwReference(source, pos, s);
			} else if (c1st === "<" && (c2nd === '-' || c2nd === '^' || c2nd === '!' || c2nd === "?")) {
				// < or <- or <^ or <! or <? 
				s = c1st + c2nd;
			} else if ((c1st === '-' || c1st === '^' || c1st === '!' || c1st === "?") && c2nd === '>') {
					s = c1st + c2nd;
			} else if (c1st === "(" && (c2nd === '$' || c2nd === '&' || c2nd === '-')) {
				// ( or ($ or (& or (- 
				s = c1st + c2nd;
			} else if ((c1st === '$' || c1st === '&' || c1st === '-') && c2nd === ')') {
				s = c1st + c2nd;
			} else if (c1st === '-' && c2nd === '|') {
				s = c1st + c2nd;
				if (c3rd === '|')
					s+= c3rd;
			} else if (source.substr(pos, 8) === "<script>") {
				token = this.readScript(source, pos);
			} else if ((c1st === '!' && c2nd === '!') || (c1st === '#' && c2nd === '#')) {
				// transclusion field & data support
				s = c1st + c2nd;
			} else if("()<>+/:|-".indexOf(c1st) !== -1) {
			// Single character
				s = c1st;
			} else if(c1st.match(/[a-zA-Z]/)) {
				// Name
				token = this.readName(source,pos);
			} else if(c1st.match(/\\/)) {
				// Pragma
				token = this.readPragma(source,pos);
			} else 
				throw "Syntax error at " + c1st;

			// Add our findings to the return array
			if(token) {
				tokens.push(token);
			} else {
				token = $tw.utils.parseTokenString(source,pos,s);
				tokens.push(token);
			}
			// Prepare for the next character
			pos = token.end;
		}
		return tokens;
	};
	
	Parser.prototype.readName = function(source,pos) {
		var re = /([a-zA-Z0-9_.-]+)/g;
		re.lastIndex = pos;
		var match = re.exec(source);
		if(match && match.index === pos) {
			return {type: "name", value: match[1], start: pos, end: pos+match[1].length};
		} else {
			throw "Invalid name";
		}
	};
	
	Parser.prototype.readPragma = function(source,pos) {
		var re = /([a-zA-Z]+)/g;
		pos++;
		re.lastIndex = pos;
		var match = re.exec(source);
		if(match && match.index === pos) {
			return {type: "pragma", value: match[1], start: pos, end: pos+match[1].length};
		} else {
			throw "Invalid pragma";
		}
	};

	Parser.prototype.readScript = function(source,pos) {
		var lpos = source.lastIndexOf("</script>", pos);
		if (lpos === -1)
			throw "Invalid Railroad script";
		var script = source.substr(pos + 8, lpos - (pos+8));
		return {type: "script", value: script, start: pos, end: lpos+8+1};
	}

	Parser.prototype.readTwReference = function(source, pos, feature) {
		var closeFeature = feature === "[[" ? "]]" : "}}";
		var cpos = source.indexOf(closeFeature, pos);
		if (cpos === -1)
			throw "Invalid TiddlyWiki Reference";
		var content = source.substr(pos + 2, cpos - (pos+2));
		return {type: "tw-ref", kind: feature, value: content, start: pos, end: cpos+2};
	}

	/////////////////////////// Exports
	
	exports.parser = Parser;
	
	})();