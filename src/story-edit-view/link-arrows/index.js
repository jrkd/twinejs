/*
Draws connector lines between passages.
*/

const uniq = require('lodash.uniq');
const { Planner, AStar, GoalNode, WorldState } = require('new-astar');
const Vue = require('vue');
const linkParser = require('../../data/link-parser');
const _ = require('lodash');

require('./index.less');

module.exports = Vue.extend({
	template: require('./index.html'),

	data: () => ({
		goapPlanner: new Planner()
	}),
	props: {
		passages: {
			type: Array,
			required: true
		},

		story:{
			type: Object,
			required: true
		},
		/*
		The positions of the passages, indexed by passage name. Each entry
		should contain top, left, width and height properties.
		*/

		positions: {
			type: Object,
			required: true
		},

		zoom: {
			type: Number,
			required: true
		}
	},
	computed: {
		/*
		A list of distinct links between passages, indexed by passage name.
		This is kept distinct from the positions property so that dragging
		passages around only triggers a redraw of the affected lines. As such,
		individual arrows *cannot* depend on the position or existence of other
		arrows-- otherwise, we'd have to recompute every link arrow when one
		changed.
		*/
		// JR -
		goapLinksByGoal(){
			this.goapPlanner.actions = [];

			let startPassage = this.passages.find(passage => passage.id == this.story.startPassage);
			let startNode = new GoalNode();

			startNode.state = startPassage.goapAction.preconditions;
			
			this.passages.forEach(passage => {
				if(passage.id != startPassage.id){
					this.goapPlanner.actions.push(passage.goapAction);
				}
			});
			this.goapPlanner.preprocessGraph(startNode);

			const goalNames = Object.keys(startPassage.goapAction.effects);
			let unmetGoals = [];
			let metGoalName = "";
			let resultPlans = {};
			let results = [];

			for (let index = 0; index < goalNames.length; ++index) {
				const goalName = goalNames[index];
				let goalNode = new GoalNode();

				goalNode.state = _.extend(new WorldState(), startPassage.goapAction.effects[goalName]);

				let goalResults = AStar.search(this.goapPlanner, startNode, goalNode);

				if (goalResults.length > 0) {
					results = goalResults;

					metGoalName = goalName;
					resultPlans[goalName] = goalResults;
				}
				else {
					unmetGoals.push(goalName);
				}
			}

			let passageLinksByGoal = {};

			Object.keys(resultPlans).forEach((goalName) =>{
				let results = resultPlans[goalName];

				passageLinksByGoal[goalName] = {};
				if(results.length > 0){
					passageLinksByGoal[goalName][startPassage.name] = this.passages.filter(passage => passage.name == results[0].action.name).map(passage => passage.name);
					while(results.length > 1){
						let firstEdge = results[0];
						let secondEdge = results[1];
		
						let thisPassage = this.passages.find(passage => passage.name == firstEdge.action.name);
		
						passageLinksByGoal[goalName][thisPassage.name] = this.passages
							.filter(passage => passage.name == secondEdge.action.name)
							.map(passage => passage.name);
						results = results.slice(1);
					}
				}
			});
			
			

			return passageLinksByGoal;
		},
		goapLinksx() {
			
		},
		links() {
			return this.passages.reduce(
				(result, passage) => {
					result[passage.name] = uniq(linkParser(passage.text, true));
					return result;
				},

				{}
			);
		},

		cssStyle() {
			/*
			In order for the arrows to not get cut off, we have to overinflate
			our base size when scaling. It's possible to do this with an SVG
			transform instead but it seems to yield weird results -- lines not
			appearing, for example. Not sure if there are performance or
			appearance implications to either approach.
			*/
			
			return {
				transform: 'scale(' + this.zoom + ')',
				width: 100 * 1 / this.zoom + '%',
				height: 100 * 1 / this.zoom + '%',
			};
		}
	},

	components: {
		'link-arrow': require('./link-arrow')
	}
});
