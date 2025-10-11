/**
 * Virtual Pet Care Task Game
 * Raise a virtual pet together for 6 days with 5 lives
 */

const marriageTaskUtil = require('../MarriageTaskUtil');
const buttonUtility = require('../../UTILS/buttonUtility');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const logger = require('../../UTILS/logger');
const dbManager = require('../../UTILS/database');

class VirtualPetTaskGame {
    constructor() {
        this.PET_TYPES = ['🐶 Dog', '🐱 Cat', '🐰 Bunny', '🦊 Fox'];
        this.init();
    }

    init() {
        marriageTaskUtil.registerGame('week5_task1', 'pet', {
            title: '🐾 Virtual Pet Care',
            description: 'Raise a virtual pet together for 6 days!',
            instructions: '• Feed, water, clean, and pet daily\n• Keep it alive for 6 days\n• 5 lives total',
            buttonLabel: 'Adopt Pet',
            buttonEmoji: '🐾',
            color: 0x8B4513,
            requiresBothPartners: false,
            autoComplete: false,
            startHandler: this.handleStart.bind(this)
        });
        logger.info('VirtualPetTaskGame registered');
    }

    async handleStart(interaction, session, util) {
        try {
            const marriage = session.marriage;
            logger.info(`Pet task started for marriage ${marriage.id}`);

            // Check if they already have a pet
            const existingPet = await this.getActivePet(marriage.id);
            logger.info(`Existing pet check: ${existingPet ? 'Found pet' : 'No pet found'}`);
            
            if (existingPet) {
                await this.showPetStatus(interaction, existingPet, marriage, util);
            } else {
                await this.showAdoptionChoices(interaction, marriage, util);
            }

        } catch (error) {
            logger.error(`Error in VirtualPetTaskGame: ${error.message}`);
            logger.error(`Error stack: ${error.stack}`);
            await util.safeReply(interaction, {
                content: '❌ Error with virtual pet system. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    async showAdoptionChoices(interaction, marriage, util) {
        const embed = new EmbedBuilder()
            .setTitle('🐾 Adopt a Virtual Pet')
            .setDescription(`**${marriage.partner1_name}** & **${marriage.partner2_name}**, choose a pet to adopt!`)
            .setColor(0x8B4513)
            .addFields(
                { name: '🎯 Goal', value: 'Keep your pet alive for 6 days by caring for it daily!', inline: false },
                { name: '🎮 How to Play', value: '• Feed, water, clean, and pet your companion\n• Stats decrease slowly over time (check every 1-2 days)\n• Don\'t let hunger or thirst reach 0!\n• You have 5 lives total', inline: false }
            );

        const petButtons = this.PET_TYPES.map((petType, index) => {
            return new ButtonBuilder()
                .setCustomId(`adopt_pet_${marriage.id}_${index}`)
                .setLabel(`Adopt ${petType}`)
                .setStyle(ButtonStyle.Primary);
        });

        const row = new ActionRowBuilder().addComponents(...petButtons);

        await util.safeReply(interaction, {
            embeds: [embed],
            components: [row]
        });

        // Setup collector for adoption buttons
        let message;
        try {
            message = await interaction.fetchReply();
        } catch (fetchError) {
            logger.warn(`Could not fetch reply for adoption collector: ${fetchError.message}`);
            return;
        }

        const collector = buttonUtility.setupCollector(message, {
            filter: (i) => i.customId.startsWith(`adopt_pet_${marriage.id}_`) && 
                           (i.user.id === marriage.partner1_id || i.user.id === marriage.partner2_id),
            time: 300000, // 5 minutes
            onCollect: async (buttonInteraction) => {
                await this.handleAdoption(buttonInteraction, marriage, util);
            }
        });
    }

    async handleAdoption(interaction, marriage, util) {
        try {
            const petIndex = parseInt(interaction.customId.split('_')[3]);
            const petType = this.PET_TYPES[petIndex];
            const petId = `pet_${marriage.id}_${Date.now()}`;
            
            logger.info(`Adopting ${petType} for marriage ${marriage.id}`);

            // Create pet in database
            const insertQuery = `
                INSERT INTO marriage_virtual_pets 
                (pet_id, marriage_id, pet_name, pet_type, hunger, thirst, cleanliness, happiness, 
                 lives_remaining, is_alive, created_at, last_interaction)
                VALUES (?, ?, ?, ?, 70, 70, 70, 70, 5, TRUE, NOW(), NOW())
            `;
            
            await dbManager.databaseAdapter.pool.execute(insertQuery, [
                petId, marriage.id, 'Your Pet', petType
            ]);

            logger.info(`Pet created in database with ID: ${petId}`);

            // Get the newly created pet
            const newPet = await this.getActivePet(marriage.id);
            
            if (newPet) {
                await this.showPetStatus(interaction, newPet, marriage, util);
            } else {
                // Fallback if database query fails
                const embed = new EmbedBuilder()
                    .setTitle('🎉 Pet Adopted!')
                    .setDescription(`**${marriage.partner1_name}** & **${marriage.partner2_name}** have adopted a ${petType}!`)
                    .setColor(0x00FF00)
                    .addFields(
                        { name: '📊 Stats', value: 'Hunger: 70%\nThirst: 70%\nCleanliness: 70%\nHappiness: 70%', inline: true },
                        { name: '❤️ Lives', value: '5/5', inline: true },
                        { name: '⏰ Goal', value: 'Keep alive for 6 days!', inline: false },
                        { name: '🔄 Next Step', value: 'Use `/marriage tasks` to manage your pet!', inline: false }
                    );

                await util.safeReply(interaction, {
                    embeds: [embed]
                });
            }

        } catch (error) {
            logger.error(`Error in handleAdoption: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error adopting pet. Please try again.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    async showPetStatus(interaction, pet, marriage, util) {
        // Update pet stats based on time passed
        await this.updatePetStats(pet);
        
        const embed = new EmbedBuilder()
            .setTitle(`${pet.pet_type} Status`)
            .setDescription(`Pet of **${marriage.partner1_name}** & **${marriage.partner2_name}**`)
            .setColor(pet.is_alive ? 0x00FF00 : 0xFF0000);

        if (pet.is_alive) {
            embed.addFields(
                { 
                    name: '📊 Stats', 
                    value: `🍖 Hunger: ${pet.hunger}%\n💧 Thirst: ${pet.thirst}%\n🧼 Cleanliness: ${pet.cleanliness}%\n😊 Happiness: ${pet.happiness}%`, 
                    inline: true 
                },
                { name: '❤️ Lives', value: `${pet.lives_remaining}/5`, inline: true }
            );

            // Calculate days alive
            const daysAlive = Math.floor((Date.now() - new Date(pet.created_at).getTime()) / (1000 * 60 * 60 * 24));
            embed.addFields({ name: '📅 Days Alive', value: `${daysAlive}/6`, inline: false });

            // Check if task complete (6 days)
            if (daysAlive >= 6) {
                embed.addFields({ 
                    name: '🎉 Task Complete!', 
                    value: 'You\'ve kept your pet alive for 6 days!', 
                    inline: false 
                });
                
                await marriageTaskUtil.markTaskCompleted(marriage.id, 1, 'both', {
                    petType: pet.pet_type,
                    daysAlive: daysAlive,
                    livesRemaining: pet.lives_remaining
                });
            }

            // Create action buttons
            const buttons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`pet_feed_${pet.pet_id}`)
                        .setLabel('Feed')
                        .setEmoji('🍖')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`pet_water_${pet.pet_id}`)
                        .setLabel('Water')
                        .setEmoji('💧')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`pet_clean_${pet.pet_id}`)
                        .setLabel('Clean')
                        .setEmoji('🧼')
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`pet_pet_${pet.pet_id}`)
                        .setLabel('Pet')
                        .setEmoji('🤗')
                        .setStyle(ButtonStyle.Success)
                );

            await util.safeReply(interaction, {
                embeds: [embed],
                components: [buttons]
            });

            // Setup button collector
            let message;
            try {
                message = await interaction.fetchReply();
            } catch (fetchError) {
                logger.warn(`Could not fetch reply for pet collector setup: ${fetchError.message}`);
                return; // Cannot setup collector without message reference
            }
            const collector = buttonUtility.setupCollector(message, {
                filter: (i) => i.customId.startsWith('pet_') && i.customId.includes(pet.pet_id),
                time: 300000, // 5 minutes
                onCollect: async (buttonInteraction) => {
                    await this.handlePetInteraction(buttonInteraction, pet, marriage, util);
                }
            });
        } else {
            embed.addFields(
                { name: '💀 Status', value: 'Your pet has passed away...', inline: false },
                { name: '❤️ Lives Remaining', value: `${pet.lives_remaining}/5`, inline: true }
            );

            if (pet.lives_remaining > 0) {
                embed.addFields({ 
                    name: '🔄 Respawn', 
                    value: 'Your pet will respawn with one less life.', 
                    inline: false 
                });

                const button = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`pet_respawn_${pet.pet_id}`)
                            .setLabel('Respawn Pet')
                            .setEmoji('🔄')
                            .setStyle(ButtonStyle.Primary)
                    );

                await util.safeReply(interaction, {
                    embeds: [embed],
                    components: [button]
                });

                // Setup respawn button collector
                let message;
                try {
                    message = await interaction.fetchReply();
                } catch (fetchError) {
                    logger.warn(`Could not fetch reply for respawn collector setup: ${fetchError.message}`);
                    return; // Cannot setup collector without message reference
                }
                const collector = buttonUtility.setupCollector(message, {
                    filter: (i) => i.customId.startsWith('pet_respawn_') && i.customId.includes(pet.pet_id),
                    time: 300000, // 5 minutes
                    onCollect: async (buttonInteraction) => {
                        await this.handleRespawn(buttonInteraction, pet, marriage, util);
                    }
                });
            } else {
                embed.addFields({ 
                    name: '❌ Task Failed', 
                    value: 'No lives remaining. Start over with a new pet.', 
                    inline: false 
                });

                await util.safeReply(interaction, {
                    embeds: [embed]
                });
            }
        }
    }

    async updatePetStats(pet) {
        const hoursSinceInteraction = Math.floor((Date.now() - new Date(pet.last_interaction).getTime()) / (1000 * 60 * 60));
        
        if (hoursSinceInteraction > 0 && pet.is_alive) {
            // Decrease stats over time (VERY slow decay for easy gameplay)
            pet.hunger = Math.max(0, pet.hunger - (hoursSinceInteraction * 0.8));      // Reduced from 2 to 0.8
            pet.thirst = Math.max(0, pet.thirst - (hoursSinceInteraction * 1.2));     // Reduced from 3 to 1.2
            pet.cleanliness = Math.max(0, pet.cleanliness - (hoursSinceInteraction * 0.5)); // Reduced from 1 to 0.5
            pet.happiness = Math.max(0, pet.happiness - (hoursSinceInteraction * 0.3));     // Reduced from 1 to 0.3

            // Check if pet dies
            if (pet.hunger <= 0 || pet.thirst <= 0) {
                pet.is_alive = false;
                pet.lives_remaining--;
            }

            // Update database
            const updateQuery = `
                UPDATE marriage_virtual_pets 
                SET hunger = ?, thirst = ?, cleanliness = ?, happiness = ?, 
                    is_alive = ?, lives_remaining = ?, last_interaction = NOW()
                WHERE pet_id = ?
            `;
            
            await dbManager.databaseAdapter.pool.execute(updateQuery, [
                pet.hunger, pet.thirst, pet.cleanliness, pet.happiness,
                pet.is_alive, pet.lives_remaining, pet.pet_id
            ]);
        }
    }

    async getActivePet(marriageId) {
        try {
            const query = `
                SELECT * FROM marriage_virtual_pets 
                WHERE marriage_id = ? AND (is_alive = TRUE OR lives_remaining > 0)
                ORDER BY created_at DESC LIMIT 1
            `;
            
            const [pets] = await dbManager.databaseAdapter.pool.execute(query, [marriageId]);
            return pets[0] || null;
        } catch (error) {
            logger.error(`Error getting active pet: ${error.message}`);
            return null;
        }
    }

    async handlePetInteraction(interaction, pet, marriage, util) {
        try {
            const actionType = interaction.customId.split('_')[1]; // feed, water, clean, pet
            
            // Update pet based on action (MUCH higher benefits for easy gameplay)
            switch (actionType) {
                case 'feed':
                    pet.hunger = Math.min(100, pet.hunger + 50);     // Increased from 35 to 50
                    break;
                case 'water':
                    pet.thirst = Math.min(100, pet.thirst + 55);     // Increased from 40 to 55
                    break;
                case 'clean':
                    pet.cleanliness = Math.min(100, pet.cleanliness + 60); // Increased from 45 to 60
                    break;
                case 'pet':
                    pet.happiness = Math.min(100, pet.happiness + 45);     // Increased from 30 to 45
                    break;
            }

            // Update database
            const updateQuery = `
                UPDATE marriage_virtual_pets 
                SET hunger = ?, thirst = ?, cleanliness = ?, happiness = ?, last_interaction = NOW()
                WHERE pet_id = ?
            `;
            
            await dbManager.databaseAdapter.pool.execute(updateQuery, [
                pet.hunger, pet.thirst, pet.cleanliness, pet.happiness, pet.pet_id
            ]);

            // Show updated status
            await this.showPetStatus(interaction, pet, marriage, util);
            
        } catch (error) {
            logger.error(`Error handling pet interaction: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error caring for pet.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    async handleRespawn(interaction, pet, marriage, util) {
        try {
            // Respawn pet with reduced lives (higher starting stats for easier gameplay)
            const updateQuery = `
                UPDATE marriage_virtual_pets 
                SET is_alive = TRUE, hunger = 70, thirst = 70, cleanliness = 70, happiness = 70, last_interaction = NOW()
                WHERE pet_id = ?
            `;
            
            await dbManager.databaseAdapter.pool.execute(updateQuery, [pet.pet_id]);
            
            // Update local pet object
            pet.is_alive = true;
            pet.hunger = 70;
            pet.thirst = 70;
            pet.cleanliness = 70;
            pet.happiness = 70;

            // Show updated status
            await this.showPetStatus(interaction, pet, marriage, util);
            
        } catch (error) {
            logger.error(`Error respawning pet: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error respawning pet.',
                flags: MessageFlags.Ephemeral
            });
        }
    }
}

module.exports = VirtualPetTaskGame;