/**
 * Virtual Pet Care Task Game
 * Raise a virtual pet together for 2 weeks with 3 lives
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
        marriageTaskUtil.registerGame('week5_task6', 'pet', {
            title: '🐾 Virtual Pet Care',
            description: 'Raise a virtual pet together for 2 weeks!',
            instructions: '• Feed, water, clean, and pet daily\n• Keep it alive for 2 weeks\n• 3 lives total',
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
            const petId = `pet_${marriage.id}_${Date.now()}`;

            // Check if they already have a pet
            const existingPet = await this.getActivePet(marriage.id);
            
            if (existingPet) {
                await this.showPetStatus(interaction, existingPet, marriage, util);
            } else {
                await this.adoptNewPet(interaction, marriage, petId, util);
            }

        } catch (error) {
            logger.error(`Error in VirtualPetTaskGame: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error with virtual pet.',
                ephemeral: true
            });
        }
    }

    async adoptNewPet(interaction, marriage, petId, util) {
        const petType = this.PET_TYPES[Math.floor(Math.random() * this.PET_TYPES.length)];
        
        // Create pet in database
        const insertQuery = `
            INSERT INTO marriage_virtual_pets 
            (pet_id, marriage_id, pet_name, pet_type, hunger, thirst, cleanliness, happiness, 
             lives_remaining, is_alive, created_at, last_interaction)
            VALUES (?, ?, ?, ?, 50, 50, 50, 50, 3, TRUE, NOW(), NOW())
        `;
        
        await dbManager.databaseAdapter.pool.execute(insertQuery, [
            petId, marriage.id, 'Your Pet', petType
        ]);

        const embed = new EmbedBuilder()
            .setTitle('🎉 Pet Adopted!')
            .setDescription(`**${marriage.partner1_name}** & **${marriage.partner2_name}** have adopted a ${petType}!`)
            .setColor(0x00FF00)
            .addFields(
                { name: '📊 Stats', value: 'Hunger: 50%\nThirst: 50%\nCleanliness: 50%\nHappiness: 50%', inline: true },
                { name: '❤️ Lives', value: '3/3', inline: true },
                { name: '⏰ Goal', value: 'Keep alive for 2 weeks!', inline: false }
            );

        await util.safeReply(interaction, {
            embeds: [embed]
        });
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
                { name: '❤️ Lives', value: `${pet.lives_remaining}/3`, inline: true }
            );

            // Calculate days alive
            const daysAlive = Math.floor((Date.now() - new Date(pet.created_at).getTime()) / (1000 * 60 * 60 * 24));
            embed.addFields({ name: '📅 Days Alive', value: `${daysAlive}/14`, inline: false });

            // Check if task complete (14 days)
            if (daysAlive >= 14) {
                embed.addFields({ 
                    name: '🎉 Task Complete!', 
                    value: 'You\'ve kept your pet alive for 2 weeks!', 
                    inline: false 
                });
                
                await marriageTaskUtil.markTaskCompleted(marriage.id, 6, 'both', {
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
                { name: '❤️ Lives Remaining', value: `${pet.lives_remaining}/3`, inline: true }
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
            // Decrease stats over time
            pet.hunger = Math.max(0, pet.hunger - (hoursSinceInteraction * 5));
            pet.thirst = Math.max(0, pet.thirst - (hoursSinceInteraction * 7));
            pet.cleanliness = Math.max(0, pet.cleanliness - (hoursSinceInteraction * 3));
            pet.happiness = Math.max(0, pet.happiness - (hoursSinceInteraction * 4));

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
            
            // Update pet based on action
            switch (actionType) {
                case 'feed':
                    pet.hunger = Math.min(100, pet.hunger + 20);
                    break;
                case 'water':
                    pet.thirst = Math.min(100, pet.thirst + 25);
                    break;
                case 'clean':
                    pet.cleanliness = Math.min(100, pet.cleanliness + 30);
                    break;
                case 'pet':
                    pet.happiness = Math.min(100, pet.happiness + 15);
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
                ephemeral: true
            });
        }
    }

    async handleRespawn(interaction, pet, marriage, util) {
        try {
            // Respawn pet with reduced lives
            const updateQuery = `
                UPDATE marriage_virtual_pets 
                SET is_alive = TRUE, hunger = 50, thirst = 50, cleanliness = 50, happiness = 50, last_interaction = NOW()
                WHERE pet_id = ?
            `;
            
            await dbManager.databaseAdapter.pool.execute(updateQuery, [pet.pet_id]);
            
            // Update local pet object
            pet.is_alive = true;
            pet.hunger = 50;
            pet.thirst = 50;
            pet.cleanliness = 50;
            pet.happiness = 50;

            // Show updated status
            await this.showPetStatus(interaction, pet, marriage, util);
            
        } catch (error) {
            logger.error(`Error respawning pet: ${error.message}`);
            await util.safeReply(interaction, {
                content: '❌ Error respawning pet.',
                ephemeral: true
            });
        }
    }
}

module.exports = VirtualPetTaskGame;