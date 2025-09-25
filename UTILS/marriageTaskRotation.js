/**
 * Marriage Task Rotation System
 * Manages automatic switching of marriage tasks based on dates
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

class MarriageTaskRotation {
    constructor() {
        this.tasksDirectory = path.join(__dirname, '..', 'marriages', 'tasks');
        this.currentTaskFile = path.join(__dirname, '..', 'marriages', 'Tasks-For-This-Week.md');
        this.rotationConfigFile = path.join(__dirname, '..', 'marriages', 'task-rotation.json');
        this.ensureDirectoryExists();
        this.initializeRotationConfig();
    }

    /**
     * Ensure the tasks directory exists
     */
    ensureDirectoryExists() {
        if (!fs.existsSync(this.tasksDirectory)) {
            fs.mkdirSync(this.tasksDirectory, { recursive: true });
            logger.info('Created marriage tasks directory');
        }
    }

    /**
     * Initialize the rotation configuration file
     */
    initializeRotationConfig() {
        if (!fs.existsSync(this.rotationConfigFile)) {
            const defaultConfig = {
                currentRotation: 0,
                rotationStartDate: new Date().toISOString(),
                rotationIntervalDays: 7, // Switch tasks every 7 days
                taskSets: [
                    {
                        id: 'week1',
                        name: 'Week 1 - Getting to Know Each Other',
                        startDate: null, // Will be set when active
                        tasks: [
                            'Win a game of tic tac toe.',
                            'Plant a tree. Keep it alive for a week.',
                            'Write a poem about nature together. Let others vote on it!',
                            'How well do you know each other? Take a quiz about your partner.'
                        ]
                    },
                    {
                        id: 'week2', 
                        name: 'Week 2 - Adventures Together',
                        startDate: null,
                        tasks: [
                            'Go on a virtual adventure together using the bot.',
                            'Create a shared playlist and listen to it together.',
                            'Write a short story together, taking turns with each sentence.',
                            'Plan a virtual date and execute it through the bot.'
                        ]
                    },
                    {
                        id: 'week3',
                        name: 'Week 3 - Creative Challenges', 
                        startDate: null,
                        tasks: [
                            'Draw or describe your dream house together.',
                            'Create a memory book of your favorite moments.',
                            'Write and perform a mini play together.',
                            'Design a couple\'s coat of arms or logo.'
                        ]
                    },
                    {
                        id: 'week4',
                        name: 'Week 4 - Building Deeper Bonds',
                        startDate: null,
                        tasks: [
                            'Share your biggest dreams and support each other.',
                            'Plan a surprise virtual event for your partner.',
                            'Create a couple\'s mission statement or goals.',
                            'Write letters to your future selves to read next year.'
                        ]
                    }
                ]
            };
            
            this.saveRotationConfig(defaultConfig);
            logger.info('Initialized marriage task rotation configuration');
        }
    }

    /**
     * Get the current rotation configuration
     */
    getRotationConfig() {
        try {
            const configData = fs.readFileSync(this.rotationConfigFile, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            logger.error(`Failed to read rotation config: ${error.message}`);
            return null;
        }
    }

    /**
     * Save the rotation configuration
     */
    saveRotationConfig(config) {
        try {
            fs.writeFileSync(this.rotationConfigFile, JSON.stringify(config, null, 2));
            return true;
        } catch (error) {
            logger.error(`Failed to save rotation config: ${error.message}`);
            return false;
        }
    }

    /**
     * Check if tasks need to be rotated and perform rotation if needed
     */
    async checkAndRotateTasks() {
        const config = this.getRotationConfig();
        if (!config) return false;

        const now = new Date();
        const rotationStart = new Date(config.rotationStartDate);
        const daysSinceStart = Math.floor((now - rotationStart) / (1000 * 60 * 60 * 24));
        
        // Calculate which rotation we should be on
        const expectedRotation = Math.floor(daysSinceStart / config.rotationIntervalDays) % config.taskSets.length;
        
        // If we need to rotate to a different set
        if (expectedRotation !== config.currentRotation) {
            return await this.rotateTasks(expectedRotation);
        }

        return false; // No rotation needed
    }

    /**
     * Rotate to a specific task set
     */
    async rotateTasks(rotationIndex) {
        const config = this.getRotationConfig();
        if (!config || rotationIndex >= config.taskSets.length) return false;

        const taskSet = config.taskSets[rotationIndex];
        if (!taskSet || !taskSet.name || !taskSet.id) {
            logger.error(`Invalid task set at rotation index ${rotationIndex}`);
            return false;
        }
        const now = new Date();

        // Update the current rotation
        config.currentRotation = rotationIndex;
        if (config.taskSets[rotationIndex]) {
            config.taskSets[rotationIndex].startDate = now.toISOString();
        }

        // Generate the new task file content
        const weekStart = this.getWeekDateString(now);
        const taskContent = this.generateTaskFileContent(taskSet, weekStart);

        try {
            // Write the new tasks to the current task file
            fs.writeFileSync(this.currentTaskFile, taskContent);
            
            // Save the updated config
            this.saveRotationConfig(config);
            
            logger.info(`Rotated to task set: ${taskSet.name} (${taskSet.id})`);
            return true;
        } catch (error) {
            logger.error(`Failed to rotate tasks: ${error.message}`);
            return false;
        }
    }

    /**
     * Generate task file content from a task set
     */
    generateTaskFileContent(taskSet, weekString) {
        let content = `# ${weekString} - ${taskSet.name}\n\n## Tasks\n`;
        
        taskSet.tasks.forEach((task, index) => {
            content += `- [ ] Task ${index + 1}: ${task}\n`;
        });

        content += '\n';
        return content;
    }

    /**
     * Get a formatted week date string
     */
    getWeekDateString(date) {
        const options = { 
            month: 'long', 
            day: 'numeric', 
            year: 'numeric' 
        };
        return `Week of ${date.toLocaleDateString('en-US', options)}`;
    }

    /**
     * Get current task set information
     */
    getCurrentTaskSet() {
        const config = this.getRotationConfig();
        if (!config) return null;

        const taskSet = config.taskSets[config.currentRotation];
        return {
            ...taskSet,
            rotation: config.currentRotation,
            totalSets: config.taskSets.length,
            nextRotationDate: this.getNextRotationDate(config)
        };
    }

    /**
     * Calculate the next rotation date
     */
    getNextRotationDate(config) {
        const rotationStart = new Date(config.rotationStartDate);
        const daysSinceStart = Math.floor((Date.now() - rotationStart) / (1000 * 60 * 60 * 24));
        const daysUntilNext = config.rotationIntervalDays - (daysSinceStart % config.rotationIntervalDays);
        
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + daysUntilNext);
        return nextDate;
    }

    /**
     * Manually force rotation to a specific task set (admin function)
     */
    async forceRotation(rotationIndex) {
        const config = this.getRotationConfig();
        if (!config || rotationIndex < 0 || rotationIndex >= config.taskSets.length) {
            return { success: false, message: 'Invalid rotation index' };
        }

        const success = await this.rotateTasks(rotationIndex);
        if (success) {
            const taskSet = config.taskSets[rotationIndex];
            return { 
                success: true, 
                message: `Successfully rotated to: ${taskSet.name}`,
                taskSet: taskSet
            };
        } else {
            return { success: false, message: 'Failed to rotate tasks' };
        }
    }

    /**
     * Add a new task set to the rotation
     */
    addTaskSet(taskSet) {
        const config = this.getRotationConfig();
        if (!config) return false;

        // Validate task set
        if (!taskSet.id || !taskSet.name || !Array.isArray(taskSet.tasks)) {
            return { success: false, message: 'Invalid task set format' };
        }

        // Check if ID already exists
        if (config.taskSets.find(ts => ts.id === taskSet.id)) {
            return { success: false, message: 'Task set ID already exists' };
        }

        // Add the task set
        taskSet.startDate = null;
        config.taskSets.push(taskSet);
        
        const success = this.saveRotationConfig(config);
        return { 
            success: success, 
            message: success ? 'Task set added successfully' : 'Failed to save task set' 
        };
    }

    /**
     * Get all available task sets
     */
    getAllTaskSets() {
        const config = this.getRotationConfig();
        return config ? config.taskSets : [];
    }
}

module.exports = new MarriageTaskRotation();