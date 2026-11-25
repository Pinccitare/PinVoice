package com.pinvoice.app.data

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import kotlinx.coroutines.flow.Flow

@Entity(tableName = "pending_audios")
data class PendingAudioEntity(
    @PrimaryKey val id: String,
    val filePath: String,
    val watchFileName: String?,
    val watchNodeId: String?,
    val sourceDevice: String,
    val lockedTemplateId: String?,
    val createdAtEpochMs: Long,
)

@Entity(tableName = "evolutions")
data class EvolutionEntity(
    @PrimaryKey val id: String,
    val templateId: String,
    val templateName: String,
    val selectionMode: String,
    val patientLabel: String,
    val renderedText: String,
    val copilotJson: String,
    val sourceDevice: String,
    val audioPurgedAtEpochMs: Long,
    val createdAtEpochMs: Long,
)

@Dao
interface PinVoiceDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPendingAudio(audio: PendingAudioEntity)

    @Query("SELECT * FROM pending_audios ORDER BY createdAtEpochMs ASC")
    fun observePendingAudios(): Flow<List<PendingAudioEntity>>

    @Query("SELECT * FROM pending_audios WHERE id = :id")
    suspend fun getPendingAudio(id: String): PendingAudioEntity?

    @Query("SELECT * FROM pending_audios")
    suspend fun getAllPendingAudios(): List<PendingAudioEntity>

    @Query("DELETE FROM pending_audios WHERE id = :id")
    suspend fun deletePendingAudio(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEvolution(evolution: EvolutionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertEvolutions(evolutions: List<EvolutionEntity>)

    @Query("SELECT * FROM evolutions WHERE id = :id")
    suspend fun getEvolutionById(id: String): EvolutionEntity?

    @Query("UPDATE evolutions SET patientLabel = :patientLabel, renderedText = :renderedText WHERE id = :id")
    suspend fun updateEvolutionText(id: String, patientLabel: String, renderedText: String)

    @Query("SELECT * FROM evolutions ORDER BY createdAtEpochMs DESC")
    fun observeEvolutions(): Flow<List<EvolutionEntity>>

    @Query("DELETE FROM evolutions WHERE id = :id")
    suspend fun deleteEvolution(id: String)

    @Query("DELETE FROM evolutions")
    suspend fun clearAllEvolutions()
}

@Database(
    entities = [PendingAudioEntity::class, EvolutionEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class PinVoiceDatabase : RoomDatabase() {
    abstract fun dao(): PinVoiceDao

    companion object {
        @Volatile
        private var INSTANCE: PinVoiceDatabase? = null

        fun getInstance(context: Context): PinVoiceDatabase {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: Room.databaseBuilder(
                    context.applicationContext,
                    PinVoiceDatabase::class.java,
                    "pinvoice.db",
                ).build().also { INSTANCE = it }
            }
        }
    }
}
