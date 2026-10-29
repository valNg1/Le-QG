package org.legeneral.pas

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate

class SyncLogicTest {

    @Test
    fun lastDays_sevenDaysOldestFirst() {
        val days = SyncLogic.lastDays(LocalDate.of(2026, 10, 29), 7).map { it.toString() }
        assertEquals(
            listOf("2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"),
            days,
        )
    }

    @Test
    fun lastDays_crossesYear() {
        val days = SyncLogic.lastDays(LocalDate.of(2027, 1, 2), 4).map { it.toString() }
        assertEquals(listOf("2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"), days)
    }

    @Test
    fun isSendable_rejectsMissingNegativeAndAbsurd() {
        assertFalse(SyncLogic.isSendable(null))
        assertFalse(SyncLogic.isSendable(-1))
        assertFalse(SyncLogic.isSendable(200_001))
        assertTrue(SyncLogic.isSendable(0))
        assertTrue(SyncLogic.isSendable(8421))
    }

    @Test
    fun sourceLabel_defaultsAndTruncates() {
        assertEquals("Health Connect", SyncLogic.sourceLabel(emptyList()))
        assertEquals(
            "Health Connect (com.a, com.b)",
            SyncLogic.sourceLabel(listOf("com.b", "com.a", "com.a", " ")),
        )
        assertTrue(SyncLogic.sourceLabel(listOf("x".repeat(500))).length <= 120)
    }

    @Test
    fun commitBody_matchesFirestoreRulesShape() {
        val body = JSONObject(
            SyncLogic.buildCommitBody(
                "le-qg-1a6e7", "UID1",
                listOf(DaySteps("2026-10-29", 8421, listOf("com.google.android.apps.fitness"))),
                "Google Pixel 8",
            ),
        )
        val writes = body.getJSONArray("writes")
        assertEquals(2, writes.length()) // 1 jour + la méta de synchronisation

        val day = writes.getJSONObject(0)
        val upd = day.getJSONObject("update")
        assertEquals(
            "projects/le-qg-1a6e7/databases/(default)/documents/users/UID1/healthSteps/2026-10-29",
            upd.getString("name"),
        )
        val f = upd.getJSONObject("fields")
        assertEquals(setOf("date", "steps", "source"), f.keys().asSequence().toSet())
        assertEquals("8421", f.getJSONObject("steps").getString("integerValue"))
        assertEquals("syncedAt", day.getJSONArray("updateTransforms").getJSONObject(0).getString("fieldPath"))

        val meta = writes.getJSONObject(1).getJSONObject("update")
        assertTrue(meta.getString("name").endsWith("/users/UID1/healthMeta/sync"))
        assertEquals(setOf("source", "device"), meta.getJSONObject("fields").keys().asSequence().toSet())
        assertEquals("lastSyncAt", writes.getJSONObject(1).getJSONArray("updateTransforms").getJSONObject(0).getString("fieldPath"))
    }

    @Test
    fun commitBody_neverContainsAnythingElseThanTheWrittenDays() {
        val body = SyncLogic.buildCommitBody(
            "p", "u",
            listOf(DaySteps("2026-10-28", 0, emptyList()), DaySteps("2026-10-29", 10, emptyList())),
            "Pixel",
        )
        assertFalse(body.contains("2026-10-27"))
        assertTrue(body.contains("\"integerValue\":\"0\"")) // un vrai 0 reçu reste un 0
    }
}
