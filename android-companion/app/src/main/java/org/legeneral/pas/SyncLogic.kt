package org.legeneral.pas

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/** Pas d'une journée locale, avec les applications qui les ont écrits. */
data class DaySteps(val day: String, val steps: Long, val origins: List<String>)

/**
 * Logique pure (sans Android) : testée par SyncLogicTest.
 * Elle produit exactement les documents que firestore.rules accepte :
 *   users/{uid}/healthSteps/{YYYY-MM-DD} = { date, steps, source, syncedAt }
 *   users/{uid}/healthMeta/sync          = { lastSyncAt, source, device }
 */
object SyncLogic {
    const val MAX_STEPS = 200_000L

    /** n jours consécutifs finissant à `today` inclus, le plus ancien d'abord. */
    fun lastDays(today: LocalDate, n: Int): List<LocalDate> =
        (n - 1 downTo 0).map { today.minusDays(it.toLong()) }

    /** Un jour sans enregistrement (null) n'est JAMAIS envoyé comme 0. */
    fun isSendable(steps: Long?): Boolean = steps != null && steps in 0..MAX_STEPS

    fun sourceLabel(origins: Collection<String>): String {
        val names = origins.filter { it.isNotBlank() }.distinct().sorted().take(2)
        val label = if (names.isEmpty()) "Health Connect"
        else "Health Connect (" + names.joinToString(", ") + ")"
        return label.take(120)
    }

    private fun str(v: String) = JSONObject().put("stringValue", v)

    /** Corps d'un appel Firestore REST `documents:commit`, atomique. */
    fun buildCommitBody(
        projectId: String,
        uid: String,
        entries: List<DaySteps>,
        device: String,
    ): String {
        val base = "projects/$projectId/databases/(default)/documents/users/$uid"
        val writes = JSONArray()

        for (e in entries) {
            val fields = JSONObject()
                .put("date", str(e.day))
                .put("steps", JSONObject().put("integerValue", e.steps.toString()))
                .put("source", str(sourceLabel(e.origins)))
            writes.put(
                JSONObject()
                    .put("update", JSONObject().put("name", "$base/healthSteps/${e.day}").put("fields", fields))
                    // Horodatage serveur : insensible à l'horloge du téléphone.
                    .put(
                        "updateTransforms",
                        JSONArray().put(JSONObject().put("fieldPath", "syncedAt").put("setToServerValue", "REQUEST_TIME")),
                    ),
            )
        }

        val metaFields = JSONObject()
            .put("source", str(sourceLabel(entries.flatMap { it.origins })))
            .put("device", str(device.take(80)))
        writes.put(
            JSONObject()
                .put("update", JSONObject().put("name", "$base/healthMeta/sync").put("fields", metaFields))
                .put(
                    "updateTransforms",
                    JSONArray().put(JSONObject().put("fieldPath", "lastSyncAt").put("setToServerValue", "REQUEST_TIME")),
                ),
        )
        return JSONObject().put("writes", writes).toString()
    }
}
