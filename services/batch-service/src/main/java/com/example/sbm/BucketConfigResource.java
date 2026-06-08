package com.example.sbm;

import com.example.sbm.base.BucketConfigRepository;
import com.example.sbm.model.BucketConfig;
import jakarta.annotation.security.RolesAllowed;
import jakarta.inject.Inject;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.*;

import java.util.List;
import java.util.Map;

@Path("/bucket-configs")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed({"user", "admin"})
public class BucketConfigResource {

    @Inject BucketConfigRepository repo;

    @GET
    public Response list(
        @QueryParam("page")  @DefaultValue("0")       int    page,
        @QueryParam("size")  @DefaultValue("20")       int    size,
        @QueryParam("sort")  @DefaultValue("createdAt")String sort,
        @QueryParam("order") @DefaultValue("desc")     String order
    ) {
        return Response.ok(repo.findAll(page, size, sort, order))
            .header("X-Total-Count", repo.count())
            .header("Access-Control-Expose-Headers", "X-Total-Count")
            .build();
    }

    @GET @Path("/{id}")
    public Response getById(@PathParam("id") String id) {
        return repo.findById(id)
            .map(bc -> Response.ok(bc).build())
            .orElse(Response.status(404).entity(Map.of("error", "Non trovato: " + id)).build());
    }

    @POST
    public Response create(BucketConfig bc) {
        return Response.status(201).entity(repo.create(bc)).build();
    }

    @PUT @Path("/{id}")
    public Response update(@PathParam("id") String id, BucketConfig bc) {
        return repo.update(id, bc)
            .map(u -> Response.ok(u).build())
            .orElse(Response.status(404).entity(Map.of("error", "Non trovato: " + id)).build());
    }

    @DELETE @Path("/{id}")
    public Response delete(@PathParam("id") String id) {
        return repo.delete(id)
            ? Response.noContent().build()
            : Response.status(404).entity(Map.of("error", "Non trovato: " + id)).build();
    }

    @GET @Path("/search")
    public Response search(@QueryParam("q") String q,
                           @QueryParam("page") @DefaultValue("0")  int page,
                           @QueryParam("size") @DefaultValue("20") int size) {
        if (q == null || q.isBlank())
            return Response.status(400).entity(Map.of("error", "Parametro q obbligatorio")).build();
        return Response.ok(repo.search(q, page, size)).build();
    }

    @GET @Path("/active")
    public Response getActive() {
        List<BucketConfig> active = repo.findActive();
        return Response.ok(active)
            .header("X-Total-Count", active.size())
            .header("Access-Control-Expose-Headers", "X-Total-Count")
            .build();
    }
}
