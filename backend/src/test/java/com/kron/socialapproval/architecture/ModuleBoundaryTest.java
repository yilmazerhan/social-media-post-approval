package com.kron.socialapproval.architecture;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import java.util.List;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * Enforces the module boundaries described in ARCHITECTURE.md sections 1.4 and 3.1.
 *
 * <p>Documented boundaries erode; checked ones do not. Every module may be reached only through
 * its {@code api} package, and no module may reach into another module's {@code internal}.
 */
class ModuleBoundaryTest {

    private static final String ROOT = "com.kron.socialapproval";
    private static final List<String> MODULES = List.of(
            "identity", "access", "content", "workflow", "collaboration",
            "notification", "audit", "ai", "media", "reporting", "admin");

    private static JavaClasses classes;

    @BeforeAll
    static void importClasses() {
        classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages(ROOT);
    }

    @Test
    void noModuleReachesIntoAnotherModulesInternals() {
        for (String module : MODULES) {
            noClasses()
                    .that().resideOutsideOfPackage(ROOT + "." + module + "..")
                    .should().dependOnClassesThat()
                    .resideInAPackage(ROOT + "." + module + ".internal..")
                    .allowEmptyShould(true)
                    .check(classes);
        }
    }

    @Test
    void platformDoesNotDependOnBusinessModules() {
        for (String module : MODULES) {
            noClasses()
                    .that().resideInAPackage(ROOT + ".platform..")
                    .should().dependOnClassesThat()
                    .resideInAPackage(ROOT + "." + module + "..")
                    .allowEmptyShould(true)
                    .check(classes);
        }
    }
}
