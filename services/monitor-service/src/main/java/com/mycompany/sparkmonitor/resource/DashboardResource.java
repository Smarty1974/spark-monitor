package com.mycompany.sparkmonitor.resource;

import com.mycompany.sparkmonitor.dto.DashboardKpiDTO;
import com.mycompany.sparkmonitor.repository.DashboardRepository;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/dashboard")
@Produces(MediaType.APPLICATION_JSON)
@Tag(name = "Dashboard", description = "KPI aggregati per la dashboard di monitoraggio")
public class DashboardResource {

    @Inject DashboardRepository repository;

    /**
     * Restituisce i 4 KPI della dashboard in una singola risposta:
     * - runningJobs      : job con status RUNNING
     * - failedToday      : job FAILED avviati oggi
     * - avgDurationMs    : media durata esecuzioni SUCCEEDED ultime 24h (null se nessuna)
     * - activeSchedules  : schedule con enabled = true
     */
    @GET
    @Path("/kpi")
    @Operation(summary = "KPI dashboard — 4 metriche aggregate in una sola chiamata")
    public Response getKpi() {
        DashboardKpiDTO kpi = repository.getKpi();
        return Response.ok(kpi)
            .header("Cache-Control", "no-cache, no-store, must-revalidate")
            .build();
    }
}
