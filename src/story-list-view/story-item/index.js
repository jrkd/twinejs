// An individual item in the list managed by StoryListView.  This offers quick
// links for editing, playing, and deleting a story; StoryEditView handles more
// detailed changes.

'use strict';
const moment = require('moment');
const { GoalNode, Planner, AStar } = require('new-astar');
const Vue = require('vue');
const ZoomTransition = require('../zoom-transition');

require('./index.less');

module.exports = Vue.extend({
	template: require('./index.html'),

	props: {
		story: {
			type: Object,
			required: true
		}
	},

	components: {
		'item-preview': require('./item-preview'),
		'item-menu': require('./item-menu')
	},

	computed: {
		lastUpdateFormatted() {
			return moment(this.story.lastUpdate).format('lll');
		},

		hue() {
			// A hue based on the story's name.

			let result = 0;

			for (let i = 0; i < this.story.name.length; i++) {
				result += this.story.name.charCodeAt(i);
			}

			return (result % 40) * 90;
		}
	},

	events: {
		// If our parent wants to edit our own model, then we do so. This is
		// done this level so that we animate the transition correctly.

		'story-edit'(id) {
			if (this.story.id === id) {
				this.edit();
			}
		},

		// if we were previously editing a story, show a zoom shrinking back
		// into us. The signature is a little bit different to save time; we
		// know the ID of the story from the route, but don't have an object.

		'previously-editing'(id) {
			if (id === this.story.id) {
				// The method for grabbing the page position of our element is
				// cribbed from http://youmightnotneedjquery.com/.

				let rect = this.$el.getBoundingClientRect();

				new ZoomTransition({
					data: {
						reverse: true,
						x: rect.left + (rect.right - rect.left) / 2,
						y: rect.top + (rect.bottom - rect.top) / 2
					}
				}).$mountTo(document.body);
			}
		}
	},

	methods: {
		/**
		 Opens a StoryEditView for this story.

		 @method edit
		**/

		edit() {
			const pos = this.$el.getBoundingClientRect();

			new ZoomTransition({
				data: {
					x: pos.left + pos.width / 2,
					y: pos.top
				}
			})
				.$mountTo(this.$el)
				.then(
					() => {
						this.goapPlanner = new Planner();
						this.goapPlanner.actions = [];

						let startNode, goalNode = null;

						let startPassage = this.story.passages.find(passage => passage.id == this.story.startPassage);

						this.story.passages.forEach(passage => {
							if(passage.id == startPassage.id){
								startNode = new GoalNode();
								startNode.state = passage.goapAction.preconditions;

								goalNode = new GoalNode();
								goalNode.state = passage.goapAction.effects;
							}
							else{
								this.goapPlanner.actions.push(passage.goapAction);
							}
						});

						
						console.log("Number of actions:", this.goapPlanner.actions.length);
						console.log("StartNode JSON", startNode);
						console.log("GoalNode JSON", goalNode);

						this.goapPlanner.preprocessGraph(startNode);

						//DEBUG HERE
						window.passageLinks = {};
						this.story.passages.forEach((passage)=>{
							if(passage.id == this.story.startPassage){
								goalNode = new GoalNode();
								goalNode.state = passage.goapAction.effects;
	
								let results = AStar.search(this.goapPlanner, startNode, goalNode);
								// let otherPassages = this.story.passages.filter((passage) => results.map(edge => edge.action.name).some(actionName => actionName == passage.name) );
								
								// results.forEach((edge)=>{
								// 	let thisPassage = this.story.passages.find(passage => passage.name == edge.action.name);
								// 	window.passageLinks[thisPassage.name] = this.story.passages.filter(
								// });
								
								while(results.length > 1){
									let firstEdge = results[0];
									let secondEdge = results[1];

									let thisPassage = this.story.passages.find(passage => passage.name == firstEdge.action.name);

									window.passageLinks[thisPassage.name] = this.story.passages
										.filter(passage => passage.name == secondEdge.action.name)
										.map(passage => passage.name);
									results = results.slice(1);
								}
								// window.passageLinks[passage.name] = otherPassages.map(passage => passage.name);
								// if(otherPassages.length > 0){
								// 	return false;
								// }
							}
							
						});
						// this.goapPlanner.allEdges.forEach((edge)=>{
						// 	let passage = this.story.passages.find(passage => passage.goapAction.name == edge.action.name);
						// 	let adjacentActionNames = edge.nextNode.adjacentEdges.map(adjacentEdge => adjacentEdge.action.name);
						// 	let otherPassages = this.story.passages.filter((passage) => adjacentActionNames.some(actionName => actionName == passage.name) );

						// 	window.passageLinks[passage.name] = otherPassages.map(passage => passage.name);
						// });

						return window.location.hash = '#stories/' + this.story.id;
					}

				);
		}
	}
});
