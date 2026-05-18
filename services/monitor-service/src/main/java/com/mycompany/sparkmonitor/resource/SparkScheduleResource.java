package com.mycompany.sparkmonitor.resource;

import com.mycompany.sparkmonitor.dto.SparkScheduleDTO;
import com.mycompany.sparkmonitor.service.SparkScheduleService;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;
import java.util.List;

@Path("/spark-schedules")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "SparkSchedules", description = "Schedulazione job Spark")
public class SparkScheduleResource {

    @Inject SparkScheduleService service;

    @GET
    @Operation(summary = "Lista paginata schedule")
    public Response list(
        @QueryParam("page")  @DefaultValue("0")   int page,
        @QueryParam("size")  @DefaultValue("20")  int size,
        @QueryParam("sort")  @DefaultValue("id")  String sort,
        @QueryParam("order") @DefaultValue("asc") String order
    ) {
        List<SparkScheduleDTO> items = service.findAll(page, size, sort, order);
        long total = service.count();
        return Response.ok(items)
            .header("X-Total-Count", total)
            .header("Access-Control-Expose-Headers", "X-Total-Count")
            .build();
    }

    @GET @Path("/{id}")
    public Response getById(@PathParam("id") Long id) {
        return service.findById(id)
            .map(dto -> Response.ok(dto).build())
            .orElse(Response.status(404).entity(new ErrorResponse("SparkSchedule non trovato: " + id)).build());
    }

    @POST
    public Response create(@Valid SparkScheduleDTO dto) {
        return Response.status(201).entity(service.create(dto)).build();
    }

    @PUT @Path("/{id}")
    public Response update(@PathParam("id") Long id, @Valid SparkScheduleDTO dto) {
        return service.update(id, dto)
            .map(u -> Response.ok(u).build())
            .orElse(Response.status(404).entity(new ErrorResponse("SparkSchedule non trovato: " + id)).build());
    }

    @DELETE @Path("/{id}")
    public Response delete(@PathParam("id") Long id) {
        return service.delete(id)
            ? Response.noContent().build()
            : Response.status(404).entity(new ErrorResponse("SparkSchedule non trovato: " + id)).build();
    }

    @GET @Path("/search")
    public Response search(
        @QueryParam("q")    String q,
        @QueryParam("page") @DefaultValue("0")  int page,
        @QueryParam("size") @DefaultValue("20") int size
    ) {
        if (q == null || q.isBlank())
            return Response.status(400).entity(new ErrorResponse("Parametro 'q' obbligatorio")).build();
        return Response.ok(service.search(q, page, size)).build();
    }
}
