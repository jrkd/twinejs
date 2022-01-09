/*
A modal dialog for editing a single passage.
*/

const CodeMirror = require('codemirror');
const Vue = require('vue');
const locale = require('../../locale');
const { thenable } = require('../../vue/mixins/thenable');
const { changeLinksInStory, updatePassage } = require('../../data/actions/passage');
const { updateStory } = require('../../data/actions/story');
const { loadFormat } = require('../../data/actions/story-format');
const { passageDefaults } = require('../../data/store/story');
const { NodeAction, WorldState } = require('new-astar');

const _ = require('lodash');
const { default: JSONEditor } = require('jsoneditor');

require('codemirror/addon/display/placeholder');
require('codemirror/addon/hint/show-hint');
require('../../codemirror/prefix-trigger');

require('./index.less');
/*
Expose CodeMirror to story formats, currently for Harlowe compatibility.
*/

window.CodeMirror = CodeMirror;

module.exports = Vue.extend({
	template: require('./index.html'),

	data: () => ({
		passageId: '',
		storyId: '',
		oldWindowTitle: '',
		userPassageName: '',
		saveError: '',
		origin: null,
		goapPreconditions: '',
		goapEffects: '',
		goapCost: 1,
		goapPreconditionsEditor: null,
		goapEffectsEditor: null,
		goapDefaultLabel: ''
	}),

	computed: {
		cmOptions() {
			return {
				placeholder: locale.say(
					'Enter the body text of your passage here. To link to another ' +
					'passage, put two square brackets around its name, [[like ' +
					'this]].'
				),
				prefixTrigger: {
					prefixes: ['[[', '->'],
					callback: this.autocomplete.bind(this)
				},
				extraKeys: {
					'Ctrl-Space': this.autocomplete.bind(this)
				},
				indentWithTabs: true,
				lineWrapping: true,
				lineNumbers: false,
				mode: 'text'
			};
		},

		parentStory() {
			return this.allStories.find(story => story.id === this.storyId);
		},

		passage() {
			return this.parentStory.passages.find(
				passage => passage.id === this.passageId
			);
		},

		userPassageNameValid() {
			return !(this.parentStory.passages.some(
				passage => passage.name === this.userPassageName &&
					passage.id !== this.passage.id
			));
		},
		isFirstPassage(){
			return this.parentStory.startPassage === this.passage.id;
		},
		firstPassage(){
			return this.parentStory.passages.find(passage => passage.id === this.parentStory.startPassage);
		},
		autocompletions() {
			return this.parentStory.passages.map(passage => passage.name);
		}
	},

	methods: {
		autocomplete() {
			this.$refs.codemirror.$cm.showHint({
				hint: cm => {
					const wordRange = cm.findWordAt(cm.getCursor());
					const word = cm.getRange(
						wordRange.anchor,
						wordRange.head
					).toLowerCase();

					const comps = {
						list: this.autocompletions.filter(
							name => name.toLowerCase().indexOf(word) !== -1
						),
						from: wordRange.anchor,
						to: wordRange.head
					};

					CodeMirror.on(comps, 'pick', () => {
						const doc = cm.getDoc();

						doc.replaceRange(']] ', doc.getCursor());
					});

					return comps;
				},

				completeSingle: false,

				extraKeys: {
					']'(cm, hint) {
						const doc = cm.getDoc();

						doc.replaceRange(']', doc.getCursor());
						hint.close();
					},

					'-'(cm, hint) {
						const doc = cm.getDoc();

						doc.replaceRange('-', doc.getCursor());
						hint.close();
					},

					'|'(cm, hint) {
						const doc = cm.getDoc();

						doc.replaceRange('|', doc.getCursor());
						hint.close();
					}
				}
			});
		},

		saveText(text) {
			this.updatePassage(
				this.parentStory.id,
				this.passage.id,
				{ text: text }
			);
		},

		saveTags(tags) {
			this.updatePassage(
				this.parentStory.id,
				this.passage.id,
				{ tags: tags }
			);
		},

		dialogDestroyed() {
			this.$destroy();
		},

		canClose() {
			
			if (this.userPassageNameValid) {
				if (this.userPassageName !== this.passage.name) {
					//JR - Moved the below out of this chekc
				}

				this.changeLinksInStory(
					this.parentStory.id,
					this.passage.name,
					this.userPassageName
				);

				if(this.isFirstPassage && this.parentStory.goapDefaultLabel !== this.goapDefaultLabel){
					this.parentStory.goapDefaultLabel = this.goapDefaultLabel;
					this.updateStory(this.parentStory.id,
						{
							goapDefaultLabel: this.parentStory.goapDefaultLabel
						}
					);
				}


				this.passage.goapAction.name = this.userPassageName;
				this.passage.goapAction.cost = Math.max(this.goapCost, 1);//currently dont let them have different costs
				this.passage.goapAction.preconditions = _.extend(new WorldState(), this.goapPreconditionsEditor.get());
				this.passage.goapAction.effects = _.extend(new WorldState(), this.goapEffectsEditor.get());

				this.updatePassage(
					this.parentStory.id,
					this.passage.id,
					{
						name: this.userPassageName,
						goapAction: this.passage.goapAction
					}
				);
				return true;
			}

			return false;
		}
	},

	ready() {
		this.userPassageName = this.passage.name;

		//JR - set the view values from the model
		this.goapPreconditions = JSON.stringify(this.passage.goapAction.preconditions);
		this.goapEffects = JSON.stringify(this.passage.goapAction.effects);
		this.goapCost = Math.max(this.passage.goapAction.cost, 1);
		this.goapDefaultLabel = this.parentStory.goapDefaultLabel;

		/* Update the window title. */

		this.oldWindowTitle = document.title;
		document.title = locale.say('Editing \u201c%s\u201d', this.passage.name);

		/*
		Load the story's format and see if it offers a CodeMirror mode.
		*/

		if (this.$options.storyFormat) {
			this.loadFormat(
				this.$options.storyFormat.name,
				this.$options.storyFormat.version
			).then(format => {
				let modeName = format.name.toLowerCase();

				/* TODO: Resolve this special case with PR #118 */

				if (modeName === 'harlowe') {
					modeName += `-${/^\d+/.exec(format.version)}`;
				}

				if (modeName in CodeMirror.modes) {
					/*
					This is a small hack to allow modes such as Harlowe to
					access the full text of the textarea, permitting its lexer
					to grow a syntax tree by itself.
					*/

					CodeMirror.modes[modeName].cm = this.$refs.codemirror.$cm;

					/*
					Now that's done, we can assign the mode and trigger a
					re-render.
					*/

					this.$refs.codemirror.$cm.setOption('mode', modeName);
				}
			});
		}

		/*
		Set the mode to the default, 'text'. The above promise will reset it if
		it fulfils.
		*/

		this.$refs.codemirror.$cm.setOption('mode', 'text');

		/*
		Either move the cursor to the end or select the existing text, depending
		on whether this passage has only default text in it.
		*/

		if (this.passage.text === passageDefaults.text) {
			this.$refs.codemirror.$cm.execCommand('selectAll');
		}
		else {
			this.$refs.codemirror.$cm.execCommand('goDocEnd');
		}

		const $preconditions = document.getElementById("goapPreconditions");
		const $effects = document.getElementById("goapEffects");

		let preconditionsEditorName = "Pre-conditions";
		let effectsEditorName = "Effects";

		if(this.passage.id == this.parentStory.startPassage){
			preconditionsEditorName = "Initial State of the world";
			effectsEditorName = "Goal state to reach";
		}
		this.goapPreconditionsEditor = new JSONEditor($preconditions, {
			"search": false,
			"mainMenuBar": false,
			"navigationBar": false,
			"limitDragging": true,
			"name":preconditionsEditorName
		});
		this.goapEffectsEditor = new JSONEditor($effects, {
			"search": false,
			"mainMenuBar": false,
			"navigationBar": false,
			"limitDragging": true,
			"name": effectsEditorName,
			onClassName: function({ path, field, value }) {
				return 'test-class';
			}
		});

		this.goapPreconditionsEditor.set(this.passage.goapAction.preconditions);
		this.goapEffectsEditor.set(this.passage.goapAction.effects);
	},

	destroyed() {
		document.title = this.oldWindowTitle;
	},

	components: {
		'code-mirror': require('../../vue/codemirror'),
		'modal-dialog': require('../../ui/modal-dialog'),
		'tag-editor': require('./tag-editor')
	},

	vuex: {
		actions: {
			changeLinksInStory,
			updatePassage,
			loadFormat,
			updateStory
		},

		getters: {
			allStories: state => state.story.stories
		}
	},

	mixins: [thenable]
});
