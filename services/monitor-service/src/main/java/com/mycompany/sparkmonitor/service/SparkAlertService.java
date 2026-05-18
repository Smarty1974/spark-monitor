package com.mycompany.sparkmonitor.service;

import com.mycompany.sparkmonitor.dto.SparkAlertDTO;
import com.mycompany.sparkmonitor.repository.SparkAlertRepository;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.inject.Inject;
import java.util.List;
import java.util.Optional;

@ApplicationScoped
public class SparkAlertService {

    @Inject SparkAlertRepository repository;

    public List<SparkAlertDTO> findAll(int page, int size, String sort, String order) {
        return repository.findAll(page, size, sort, order)
            .stream().map(SparkAlertDTO::from).toList();
    }

    public long count() { return repository.count(); }

    public Optional<SparkAlertDTO> findById(Long id) {
        return repository.findById(id).map(SparkAlertDTO::from);
    }

    public SparkAlertDTO create(SparkAlertDTO dto) {
        return SparkAlertDTO.from(repository.create(dto.toEntity()));
    }

    public Optional<SparkAlertDTO> update(Long id, SparkAlertDTO dto) {
        return repository.update(id, dto.toEntity()).map(SparkAlertDTO::from);
    }

    public boolean delete(Long id) { return repository.delete(id); }
}
