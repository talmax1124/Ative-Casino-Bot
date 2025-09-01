# Ative Utility & Security Tool Bot
This folder is to contain the utilities and security tools for Ative Casino Bot. Provides comprehensive moderation tools, including anti-spam, anti-raid, and anti-nuke features. It also includes various utility commands to enhance server management and user experience. This includes features like welcome messages, role management, and server analytics. It also, has a robust logging system to track important events and actions within the server. It should connect to the same database as the main bot to store and retrieve data. 

## Role Pay for Server Specific
This feature is to give casino money to Admin and Mods every 3 days. Each Admin and Mod will receive a fixed amount of casino money as a salary for their role in managing the server. This helps incentivize and reward the efforts of server staff, ensuring they are compensated for their time and contributions to maintaining a positive and engaging community environment.

# Funcitons for Mods
/release-session [user]
/stop-session [user]
/forcestop-session [user]
/session-status [user]

# Functions for Admins
/add-mod [user]
/remove-mod [user]
/list-mods
/set-mod-role [role]
/remove-mod-role [role]

# Developer Commands
/set-admin [user]
/remove-admin [user]
/list-admins
/set-admin-role [role]
/remove-admin-role [role]



# Scheduling
- Admins and Mods set their schedule for being active in the chat and assisting. There should be a /setschedule command that allows them to specify their availability. This helps in organizing the moderation team and ensuring that there is always someone available to manage the server during peak times. and a /sleep command to set themselves as inactive when they are not available. as well as a /wakeup command to set themselves as active when they are available again. and a /dnb or donotdisturb command to set themselves as inactive when they are not available. and a /available command to set themselves as active when they are available again. This helps in organizing the moderation team and ensuring that there is always someone available to manage the server during peak times.

# Logging
- The bot should log all important actions and events in the server, such as message deletions, user bans, role changes, and other moderation actions. This helps in keeping track of what is happening in the server and provides a record for future reference. The logs should be stored in a secure location and should be accessible only to Admins and Mods. The bot should also provide a /viewlogs command that allows Admins and Mods to view the logs directly from the chat. This helps in quickly accessing the logs without having to go through the secure location.

# Security Features
/ban [user] [reason]
/kick [user] [reason]
/mute [user] [duration] [reason]
/unmute [user]
/warn [user] [reason]
/view-warnings [user]
/clear-warnings [user]
/anti-spam [on/off]
/anti-raid [on/off]
/anti-nuke [on/off]
/logs [view] [clear]
/welcome-message [set/remove] [message]
/role-management [add/remove] [role] [user]
/server-analytics [view]

# Database Integration
- The bot should connect to the same database as the main Ative Casino Bot to store and retrieve data. This ensures that all data is centralized and can be easily accessed by both bots. The database should store information such as user roles, warnings, logs, and other relevant data. The bot should also provide a /sync command that allows Admins to manually sync the data between the two bots. This helps in ensuring that both bots have the most up-to-date information.


# Sesion Management
- The bot should provide commands for Mods to manage user sessions. This includes starting, stopping, and releasing sessions for users who are participating in casino games. The bot should also provide a /session-status command that allows Mods to view the current status of a user's session. This helps in ensuring that users are properly managed and that their sessions are tracked accurately.

# Role Pay
- The bot should provide a role pay feature that gives casino money to Admins and Mods every 3 days. Each Admin and Mod will receive a fixed amount of casino money as a salary for their role in managing the server. This helps incentivize and reward the efforts of server staff, ensuring they are compensated for their time and contributions to maintaining a positive and engaging community environment. The bot should provide a /rolepay command that allows Admins to view the current role pay settings and make adjustments as needed. This helps in ensuring that the role pay system is flexible and can be tailored to the specific needs of the server.



