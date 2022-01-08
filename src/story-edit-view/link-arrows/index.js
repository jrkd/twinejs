/*
Draws connector lines between passages.
*/

const uniq = require('lodash.uniq');
const { Planner, AStar, GoalNode } = require('new-astar');
const Vue = require('vue');
const linkParser = require('../../data/link-parser');

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
		goapLinks() {
			this.goapPlanner.actions = [];

			let startPassage = this.passages.find(passage => passage.id == this.story.startPassage);
			let startNode = new GoalNode();

			startNode.state = startPassage.goapAction.preconditions;
			
			let goalNode = new GoalNode();

			goalNode.state = startPassage.goapAction.effects;

			this.passages.forEach(passage => {
				if(passage.id != startPassage.id){
					this.goapPlanner.actions.push(passage.goapAction);
				}
			});
			this.goapPlanner.preprocessGraph(startNode);

			let passageLinks = {};
			let results = AStar.search(this.goapPlanner, startNode, goalNode);
			

			if(results.length > 0){
				passageLinks[startPassage.name] = this.passages.filter(passage => passage.name == results[0].action.name).map(passage => passage.name);
				while(results.length > 1){
					let firstEdge = results[0];
					let secondEdge = results[1];
	
					let thisPassage = this.passages.find(passage => passage.name == firstEdge.action.name);
	
					passageLinks[thisPassage.name] = this.passages
						.filter(passage => passage.name == secondEdge.action.name)
						.map(passage => passage.name);
					results = results.slice(1);
				}
			}
			

			return passageLinks;
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
