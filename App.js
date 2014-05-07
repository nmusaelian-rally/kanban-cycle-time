Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    launch: function(){
        var context =  this.getContext();
        var project = context.getProject()['ObjectID'];
        console.log(project);
        var that = this;
        var panel = Ext.create('Ext.panel.Panel', {
                layout: 'hbox',
                itemId: 'parentPanel',
                componentCls: 'panel',
                items: [
		   
		    {
                    xtype: 'panel',
		    width: 600,
                    itemId: 'childPanel1'
		    },
		    {
                    xtype: 'panel',
		    width: 600,
                    itemId: 'childPanel2'
		    }
                ],
        });
        this.add(panel);
        Ext.create('Rally.data.lookback.SnapshotStore', {
                fetch    : ['Name','c_Kanban','_UnformattedID', '_TypeHierarchy'],
                filters  : [{
                    property : '__At',
                    value    : 'current'
                },
                {
                    property : '_TypeHierarchy',
                    value    : 'HierarchicalRequirement'
                },
               {
                    property : '_ProjectHierarchy',
                    //value    :   14020264660 //P1
                    value: project
                },
                {
                property : 'c_Kanban', //get stories with Kanban state
                operator : 'exists',
                value : true
                }
                ],
                hydrate: ['_TypeHierarchy', 'c_Kanban'],
                listeners: {
                    load: this.onStoriesLoaded, 
                    scope: this
                }
                }).load({
                    params : {
                        compress : true,
                        removeUnauthorizedSnapshots : true
                    }
                });

    },
     //make grid of stories with Kanban state
     onStoriesLoaded: function(store, data){
        var that = this;
        var stories = [];
        var id;
        _.each(data, function(record) {
            var artifactType =  record.get('_TypeHierarchy');
            //console.log(artifactType); //if no hydrate: ['_TypeHierarchy'], it prints [-51001, -51002, -51003, -51004, -51005, -51038, 14020169169]
            console.log(artifactType);   //["PersistableObject", "DomainObject", "WorkspaceDomainObject", "Artifact", "Requirement", "HierarchicalRequirement", "HierarchicalRequirement"]
            if (artifactType[artifactType.length - 1] == "HierarchicalRequirement") {
                id = 'US' + record.get('_UnformattedID');
            } else if (artifactType[artifactType.length - 1] == "Defect") {
                id = 'DE' + record.get('_UnformattedID');
            } 
            stories.push({
                Name: record.get('Name'),
                FormattedID: id,
                UnformattedID: record.get('_UnformattedID'),
                c_Kanban: record.get('c_Kanban')
            });
            console.log(stories);
            });
        
            var myStore = Ext.create('Rally.data.custom.Store', {
                data: stories
            });
            
            if (!this.down('#allStoriesGrid')) {
                this.down('#childPanel1').add({
                    xtype: 'rallygrid',
                    id: 'allStoriesGrid',
                    store: myStore,
                    columnCfgs: [
                        {
                            text: 'Formatted ID', dataIndex: 'FormattedID',
                        },
                        {
                            text: 'Name', dataIndex: 'Name', flex: 1,
                        },
                        {
                            text: 'Current Kanban State', dataIndex: 'c_Kanban'
                        }
                    ],
                    listeners: {
                        cellclick: function( grid, td, cellIndex, record, tr, rowIndex){
                            id = grid.getStore().getAt(rowIndex).get('UnformattedID');
                            console.log('id', id);
                            that.getStoryModel(id);      //to eventually build a grid of Kanban allowed values 
                            }
                    }
                });
            }else{
                this.down('#allStoriesGrid').reconfigure(myStore);
            }
     },
     
     getStoryModel:function(id){
        var workspace = this.getContext().getWorkspaceRef();
        var project = this.getContext().getProjectRef();
        console.log('workspace',workspace);
        console.log('project',project);
        console.log('get story model');
        var that = this;
        this.arr=[];
        //get a model of user story
        Rally.data.ModelFactory.getModel({
            type: 'User Story',
            context: {
                //workspace: '/workspace/14020168894',
                //project: 'project/14020264660'    //P1
                workspace: workspace,
                project: project
            },
            success: function(model){
                //Get store instance for the allowed values
                var allowedValuesStore = model.getField('c_Kanban').getAllowedValueStore( );
                that.getDropdownValues(allowedValuesStore, id);
            }
            
        });
     },
     

     getDropdownValues:function(allowedValuesStore, id){
        var that = this;
        //load data into the store
        allowedValuesStore.load({
            scope: this,
            callback: function(records, operation, success){
                _.each(records, function(val){
                    //AllowedAttributeValue object in WS API has StringValue
                    var v = val.get('StringValue');
                    that.arr.push(v);
                });
                console.log('arr', this.arr);
                that.getStoryById(id);    //former makeStore
            }
        });
    },
    
    getStoryById:function(id){
        var that = this;
        var snapStore = Ext.create('Rally.data.lookback.SnapshotStore', {
            fetch: ['c_Kanban', 'Blocked'],
            hydrate:['c_Kanban','Blocked'],
             filters : [
                {
                    property : '_UnformattedID',
                    value    : id  //15  
                }
            ],
            sorters:[
                {
                    property  : '_ValidTo',
                    direction : 'ASC'
                }
            ]
        });
        snapStore.load({
            params: {
                compress: true,
                removeUnauthorizedSnapshots : true
            },
             callback : function(records, operation, success) {
                that.onDataLoaded(records, id);
            }
        });
    },
    
    onDataLoaded:function(records, id){
        var times = [];
        var measure = 'second';
        
        //-----------------------backlog
        
        var backlog = _.filter(records, function(record) {
                    return record.get('c_Kanban') === 'backlog';
        });
        console.log('backlog',backlog);
        var cycleTimeFromBacklogToInProgress = '';
        if (_.size(backlog) > 0) {
            var backlog1 = _.first(backlog);
            var backlog2 = _.last(backlog);
            var backlogDate1 = new Date(backlog1.get('_ValidFrom'));
            if (backlog2.get('_ValidTo') === "9999-01-01T00:00:00.000Z") { //infinity
                backlogDate2 = new Date(); //now
            }
            else{
                var backlogDate2 = new Date(backlog2.get('_ValidTo'));
            }
            
            cycleTimeFromBacklogToInProgress = Rally.util.DateTime.getDifference(backlogDate2,backlogDate1, measure );
        }
        times.push(cycleTimeFromBacklogToInProgress);
        //console.log(cycleTimeFromBacklogToInProgress);
        
        //----------------------in progress
        
        
        var inProgress = _.filter(records, function(record) {
                    return record.get('c_Kanban') === 'in-progress';
        });
        console.log('in-progress',inProgress);
        var cycleTimeFromInProgressToDone = '';
        if (_.size(inProgress) > 0) {
            var inProgress1 = _.first(inProgress);
            var inProgress2 = _.last(inProgress);
            var inProgressDate1 = new Date(inProgress1.get('_ValidFrom'));
            if (inProgress2.get('_ValidTo') === "9999-01-01T00:00:00.000Z") { //infinity
                inProgressDate2 = new Date(); //now
            }
            else{
                var inProgressDate2 = new Date(inProgress2.get('_ValidTo'));
            }
            cycleTimeFromInProgressToDone = Rally.util.DateTime.getDifference(inProgressDate2,inProgressDate1, measure );
        }
        times.push(cycleTimeFromInProgressToDone);
        //console.log(cycleTimeFromInProgressToDone);

        
        //------------------------done
        
        var done = _.filter(records, function(record) {
                    return record.get('c_Kanban') === 'done';
        });
        console.log('done',done);
        var cycleTimeFromDoneToReleased = '';
        if (_.size(done) > 0) {
            var done1 = _.first(done);
            var done2 = _.last(done);
            var doneDate1 = new Date(done1.get('_ValidFrom'));
            if (done2.get('_ValidTo') === "9999-01-01T00:00:00.000Z") { //infinity
                doneDate2 = new Date(); //now
            }
            else{
                var doneDate2 = new Date(done2.get('_ValidTo'));
            }
            cycleTimeFromDoneToReleased = Rally.util.DateTime.getDifference(doneDate2,doneDate1, measure );
        }
        times.push(cycleTimeFromDoneToReleased);
        //console.log(cycleTimeFromDoneToReleased);
        
        
        /**********
        skip first '' element of the this.arr and last 'released' element of this.arr because
        do not care for cycle times in first and last kanban states
        Originally: arr ["", "backlog", "in-progress", "done", "released"] ,shorten to: ["backlog", "in-progress", "done"]
        
        **********/
        
        this.arrShortened = _.without(this.arr, _.first(this.arr),_.last(this.arr)) ;
        console.log('this.arrShortened with first and last skipped', this.arrShortened); //["backlog", "in-progress", "done"] 
         
        cycleTimes = _.zip(this.arrShortened, times);
        //console.log('cycleTimes as multi-dimentional array', cycleTimes);
        
        cycleTimes = _.object(cycleTimes);
        //console.log('cycleTimes as object', cycleTimes); //cycleTimes as object Object {backlog: 89, in-progress: 237, done: 55} 
        
        var cycleTimesArray = [];
        
        cycleTimesArray.push(cycleTimes);
        
        console.log('cycleTimesArray',cycleTimesArray);
        
         var store = Ext.create('Rally.data.custom.Store',{
            data: cycleTimesArray, 
            pageSize: 100
        });
         
         
        var columnConfig = [];
        _.each(cycleTimes,function(c,key){
            var columnConfigElement = _.object(['text', 'dataIndex', 'flex'], ['time spent in ' + key, key, 1]);
            columnConfig.push(columnConfigElement);
        });
        
        var title = 'Kanban cycle time for US' + id + ' in ' + measure + 's'
        if (!this.grid) {
            this.grid = this.down('#childPanel2').add({
                xtype: 'rallygrid',
                title: title,
                itemId: 'grid2',
                store: store,
                columnCfgs: columnConfig
            });
         }
         else{
            this.down('#grid2').reconfigure(store);
         }
    }
 
});