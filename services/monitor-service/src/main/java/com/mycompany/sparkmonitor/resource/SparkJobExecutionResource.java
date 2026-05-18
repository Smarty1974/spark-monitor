package com.mycompany.sparkmonitor.resource;

import com.mycompany.sparkmonitor.dto.SparkJobExecutionDTO;
import com.mycompany.sparkmonitor.service.SparkJobExecutionService;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;
import java.util.List;

@Path("/spark-job-executions")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "SparkJobExecutions", description = "Esecuzioni dei job Spark")
public class SparkJobExecutionResource {

    @Inject SparkJobExecutionService service;

    @GET
    @Operation(summary = "Lista paginata esecuzioni")
    public Response list(
        @QueryParam("page")       @DefaultValue("0")   int page,
        @QueryParam("size")       @DefaultValue("20")  int size,
        @QueryParam("sort")       @DefaultValue("id")  String sort,
        @QueryParam("order")      @DefaultValue("desc") String order,
        @QueryParam("sparkJobId") Long sparkJobId
    ) {
        List<SparkJobExecutionDTO> items;
        long total;
        if (sparkJobId != null) {
            items = service.findBySparkJobId(sparkJobId, page, size);
            total = items.size();
        } else {
            items = service.findAll(page, size, sort, order);
            total = service.count();
        }
        return Response.ok(items)
            .header("X-Total-Count", total)
            .header("Access-Control-Expose-Headers", "X-Total-Count")
            .build();
    }

    @GET @Path("/{id}")
    @Operation(summary = "Recupera un'esecuzione per ID")
    public Response getById(@PathParam("id") Long id) {
        return service.findById(id)
            .map(dto -> Response.ok(dto).build())
            .orElse(Response.status(404).entity(new ErrorResponse("SparkJobExecution non trovata: " + id)).build());
    }

    @POST
    @Operation(summary = "Registra una nuova esecuzione")
    public Response create(@Valid SparkJobExecutionDTO dto) {
        return Response.status(201).entity(service.create(dto)).build();
    }

    @PUT @Path("/{id}")
    @Operation(summary = "Aggiorna un'esecuzione")
    public Response update(@PathParam("id") Long id, @Valid SparkJobExecutionDTO dto) {
        return service.update(id, dto)
            .map(u -> Response.ok(u).build())
            .orElse(Response.status(404).entity(new ErrorResponse("SparkJobExecution non trovata: " + id)).build());
    }

    @DELETE @Path("/{id}")
    @Operation(summary = "Elimina un'esecuzione")
    public Response delete(@PathParam("id") Long id) {
        return service.delete(id)
            ? Response.noContent().build()
            : Response.status(404).entity(new ErrorResponse("SparkJobExecution non trovata: " + id)).build();
    }
}
